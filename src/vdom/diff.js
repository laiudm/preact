import { ATTR_KEY } from '../constants';
import { isSameNodeType, isNamedNode } from './index';
import { buildComponentFromVNode } from './component';
import { createNode, setAccessor } from '../dom/index';
import { unmountComponent } from './component';
import options from '../options';
import { removeNode } from '../dom';

/** Queue of components that have been mounted and are awaiting componentDidMount */
export const mounts = [];

/** Diff recursion count, used to track the end of the diff cycle. */
//dcm: and track the start!
export let diffLevel = 0;

/** Global flag indicating if the diff is currently within an SVG */
let isSvgMode = false;

/** Global flag indicating if the diff is performing hydration */
let hydrating = false;

/** Invoke queued componentDidMount lifecycle methods */
export function flushMounts() {
	let c;
	while ((c=mounts.pop())) {
		if (options.afterMount) options.afterMount(c);
		if (c.componentDidMount) c.componentDidMount();	//dcm: call lifecycle method
	}
}


/** Apply differences in a given vnode (and it's deep children) to a real DOM Node.
 *	@param {Element} [dom=null]		A DOM node to mutate into the shape of the `vnode`
 *	@param {VNode} vnode			A VNode (with descendants forming a tree) representing the desired DOM structure
 *	@returns {Element} dom			The created/mutated element
 *	@private
 */
 //dcm: if dom is null, create it & mutate into the shape of the vnode
 //dcm: parent = DOM element to render into. It must exist (I think)
export function diff(dom, vnode, context, mountAll, parent, componentRoot) {
	//dcm: described generally in part 2 of walk-thru.
	// diffLevel having been 0 here indicates initial entry into the diff (not a subdiff)
	if (!diffLevel++) {
		//dcm: just starting the diff of the top-most component.
		// when first starting the diff, check if we're diffing an SVG or within an SVG
		isSvgMode = parent!=null && parent.ownerSVGElement!==undefined;

		// hydration is indicated by the existing element to be diffed not having a prop cache
		hydrating = dom!=null && !(ATTR_KEY in dom);
	}

	let ret = idiff(dom, vnode, context, mountAll, componentRoot);

	// append the element if its a new parent
	if (parent && ret.parentNode!==parent) parent.appendChild(ret);

	// diffLevel being reduced to 0 means we're exiting the diff
	if (!--diffLevel) {
		hydrating = false;
		// invoke queued componentDidMount lifecycle methods
		if (!componentRoot) flushMounts();
	}

	return ret;
}


/** Internals of `diff()`, separated to allow bypassing diffLevel / mount flushing. */
function idiff(dom, vnode, context, mountAll, componentRoot) {
	let out = dom,
		prevSvgMode = isSvgMode;

	// empty values (null, undefined, booleans) render as empty Text nodes
	if (vnode==null || vnode===false || vnode===true) vnode = '';


	// Fast case: Strings & Numbers create/update Text nodes.
	//dcm: optimisation not discussed in the walk-thru.
	if (typeof vnode==='string' || typeof vnode==='number') {
		// update if it's already a Text node:
		if (dom && dom.splitText!==undefined && dom.parentNode && (!dom._component || componentRoot)) {
			if (dom.nodeValue!=vnode) {
				dom.nodeValue = vnode;
			}
		}
		else {
			// it wasn't a Text node: replace it with one and recycle the old Element
			out = document.createTextNode(vnode);
			if (dom) {
				if (dom.parentNode) dom.parentNode.replaceChild(out, dom);
				recollectNodeTree(dom, true);
			}
		}

		out[ATTR_KEY] = true;

		return out;
	}


	// If the VNode represents a Component, perform a component diff:
	if (typeof vnode.nodeName==='function') {
		return buildComponentFromVNode(dom, vnode, context, mountAll);
	}
	
	//dcm: from now on it must be a regular html element, update the DOM to have correct elements & attributes

	// Tracks entering and exiting SVG namespace when descending through the tree.
	isSvgMode = vnode.nodeName==='svg' ? true : vnode.nodeName==='foreignObject' ? false : isSvgMode;


	// If there's no existing element or it's the wrong type, create a new one:
	if (!dom || !isNamedNode(dom, String(vnode.nodeName))) {
		out = createNode(String(vnode.nodeName), isSvgMode);

		if (dom) {
			// move children into the replacement node
			while (dom.firstChild) out.appendChild(dom.firstChild);

			// if the previous Element was mounted into the DOM, replace it inline
			if (dom.parentNode) dom.parentNode.replaceChild(out, dom);

			// recycle the old element (skips non-Element node types)
			recollectNodeTree(dom, true);
		}
	}


	let fc = out.firstChild,
		props = out[ATTR_KEY] || (out[ATTR_KEY] = {}),	//dcm: very important - props now "points to" the map on the DOM node. It's not a copy. Any changes to props affects attribute on the DOM node because it's the same thing.
		vchildren = vnode.children;

	// Optimization: fast-path for elements containing a single TextNode:
	//dcm: can only optimise AFTER the first render, as indicated by hydrating
	if (!hydrating && vchildren && vchildren.length===1 && typeof vchildren[0]==='string' && fc!=null && fc.splitText!==undefined && fc.nextSibling==null) {
		if (fc.nodeValue!=vchildren[0]) {
			fc.nodeValue = vchildren[0];
		}
	}
	// otherwise, if there are existing or new children, diff them:
	//dcm: once the current level of the DOM matches the vnode, call innerDiffNode() to diff the DOM node's children
	//dcm: comment above may not be 100%
	else if (vchildren && vchildren.length || fc!=null) {
		innerDiffNode(out, vchildren, context, mountAll, hydrating || props.dangerouslySetInnerHTML!=null);
	}


	// Apply attributes/props from VNode to the DOM Element:
	//dcm: see note above re. props - it _IS_ the ATTR_KEY attribute on the DOM node.
	diffAttributes(out, vnode.attributes, props);


	// restore previous SVG mode: (in case we're exiting an SVG namespace)
	isSvgMode = prevSvgMode;

	return out;
}


/** Apply child and attribute changes between a VNode and a DOM Node to the DOM.
 *	@param {Element} dom			Element whose children should be compared & mutated
 *	@param {Array} vchildren		Array of VNodes to compare to `dom.childNodes`
 *	@param {Object} context			Implicitly descendant context object (from most recent `getChildContext()`)
 *	@param {Boolean} mountAll
 *	@param {Boolean} isHydrating	If `true`, consumes externally created elements similar to hydration
 */
function innerDiffNode(dom, vchildren, context, mountAll, isHydrating) {
	
	//dcm: decides which DOM child node to pair with each of vnode's children. Steps are:
	//dcm: 1. index the existing DOM children
	//dcm: 2. for each vnode, use those indexes to try to find a matching DOM node
	//dcm: 3. diff the vnode and (possible) matching DOM node so they match
	//dcm: 4. insert the DOM node into the right place in the DOM, if necessary
	//dcm: 5. clean up any old DOM nodes that didn't get used.
	
	let originalChildren = dom.childNodes,
		children = [],	//dcm: array of old child DOM nodes without keys
		keyed = {},		//dcm: map of old child DOM nodes by key
		keyedLen = 0,	//dcm: no. of nodes in keyed{} - used nodes are set to undefined
		min = 0,		//dcm: minimum index into children[] that has a node
		len = originalChildren.length,
		childrenLen = 0,	//dcm: length of children[]. tracked separately as some entries are nulled/undefined out
		vlen = vchildren ? vchildren.length : 0,
		j, c, vchild, child;

	// Build up a map of keyed children and an Array of unkeyed children:
	//dcm: iterate thru the old DOM node's children and sort them into the right index - either children[] or keyed{}
	if (len!==0) {
		for (let i=0; i<len; i++) {
			let child = originalChildren[i],
				props = child[ATTR_KEY],
				//dcm: find the key associated with this node, as set during the last render. 
				//dcm: Optimisation: only build if the no. of "to-be" nodes > 0 (ie vlen)
				//dcm: Location of the key depends on whether the dom node was created from a component or from a simple vnode.
				//dcm: props will always be present on a dom node created by preact. But ._component is only present for nodes
				//dcm: associated with a component, in which case, get the key from the component. Otherwise get from props.
				key = vlen && props ? child._component ? child._component.__key : props.key : null; 
				
			if (key!=null) {	//dcm: it had a key, add it to keyed{}
				keyedLen++;
				keyed[key] = child;
			}
			//dcm: otherwise, add it to children[], but only maybe!
			//dcm: following line is different from walk-thru. 
			
			else if (props || 
				//dcm: child.splitText is to see if child is a TextNode (see comments in vdom/index/isSameNodeType()
				(child.splitText!==undefined 
					? (isHydrating ? child.nodeValue.trim() : true) //dcm: it's a text node; nodeValue gives the contents of the text node,
																	  //dcm: so insert if hydrating & there's some contents; always insert if not hydrating
					: isHydrating)) {								  //dcm: not a text node, only insert if hydrating
				children[childrenLen++] = child;
			}
			//dcm: some child nodes will NOT be added to either keyed{} or to children[]. They're not recollected/garbage-collected; what happens to them? 
		}
	}
	
	//dcm: now that we've indexed the DOM nodes, loop thru. the child vnodes (the to-be state) & try to find a match against the as-is dom nodes
	//dcm: if the vnode has a key, we look for a match in the keyed{} index, otherwise look for a matching tag in children[]
	if (vlen!==0) {
		for (let i=0; i<vlen; i++) {
			vchild = vchildren[i];	//dcm: current node seeking a match
			child = null;			//dcm: the matched DOM node

			// attempt to find a dom node based on key matching
			let key = vchild.key;	//dcm: match against the key attribute (which h() has already extracted out to put on the vnode)
			if (key!=null) {
				if (keyedLen && keyed[key]!==undefined) {	//dcm: checking keyedLen looks like an optimisation
					child = keyed[key];
					keyed[key] = undefined;		//dcm: remove used DOM node from the index, 
					keyedLen--;					//dcm: and decr. the number remaining in the index.
				}
			}
			// attempt to pluck a node of the same type from the existing children
			else if (!child && min<childrenLen) {	//dcm: check for !child is superfluous; it's always null at this point. This if() is a perf optimisation
				for (j=min; j<childrenLen; j++) {	//dcm: loop from starting entry to end, with these limits updating (perf. optimisation)
					if (children[j]!==undefined && isSameNodeType(c = children[j], vchild, isHydrating)) {
						child = c;
						children[j] = undefined;				//dcm: children[] starts as an array 0..childrenLength-1; null out the matched entry
						if (j===childrenLen-1) childrenLen--;	//dcm: If hole created at end, update end position
						if (j===min) min++;					//dcm: If hole created at start, update start position
						break;
					}
				}
			}

			// morph the matched/found/created DOM child to match vchild (deep)
			//dcm: may have found a matching DOM node in child; make their attributes match.
			//dcm: if we hadn't found a match, child will be null and idiff() will create a dom node
			child = idiff(child, vchild, context, mountAll);

			//dcm: status of node is uncertain. It might already be a child of the parent
			//dcm: and in the right place amongst sibings. OR it might be a reused node that
			//dcm: needs to be in a new spot. OR it's a new node that needs to placed inside its parent
			if (child && child!==dom) {
				if (i>=len) {	//dcm: if the current child is past old DOM length, just append
					dom.appendChild(child);
				}
				else if (child!==originalChildren[i]) {	//dcm: if current child differs from what used to be at this index
					if (child===originalChildren[i+1]) {
						removeNode(originalChildren[i]);
					}
					else {
						dom.insertBefore(child, originalChildren[i] || null);
					}
				}
			}
		}
	}
	
	//dcm: that's the end of the work we need for each child vnode
	//dcm: now time to clean up lingering DOM nodes that aren't needed any more.
	// remove unused keyed children:
	if (keyedLen) {
		for (let i in keyed) if (keyed[i]!==undefined) recollectNodeTree(keyed[i], false);
	}

	// remove orphaned unkeyed children:
	while (min<=childrenLen) {
		if ((child = children[childrenLen--])!==undefined) recollectNodeTree(child, false);
	}
}



/** Recursively recycle (or just unmount) a node an its descendants.
 *	@param {Node} node						DOM node to start unmount/removal from
 *	@param {Boolean} [unmountOnly=false]	If `true`, only triggers unmount lifecycle, skips removal
 */
 //dcm: when we find a node that's no longer needed, need to get rid of its children too.
 //dcm: walk the tree recycling each node, and unmounting any component that might have rendered it.
export function recollectNodeTree(node, unmountOnly) {
	let component = node._component;
	if (component) {
		// if node is owned by a Component, unmount that component (ends up recursing back here)
		//dcm: just unmount it to let callbacks run before node is removed
		unmountComponent(component);
	}
	else {
		// If the node's VNode had a ref function, invoke it with null here.
		//dcm: ie null out the ref pointing to this node.
		// (this is part of the React spec, and smart for unsetting references)
		if (node[ATTR_KEY]!=null && node[ATTR_KEY].ref) node[ATTR_KEY].ref(null);

		//dcm: recycle node unless asked to only handle unmounting
		if (unmountOnly===false || node[ATTR_KEY]==null) {
			removeNode(node);
		}

		//dcm: recurse on child nodes. Walk-thru had this inline, not a separate function.
		removeChildren(node);
	}
}


/** Recollect/unmount all children.
 *	- we use .lastChild here because it causes less reflow than .firstChild
 *	- it's also cheaper than accessing the .childNodes Live NodeList
 */
 //dcm: new function cf. walk-thru. Only called from one place.
export function removeChildren(node) {
	node = node.lastChild;
	while (node) {
		let next = node.previousSibling;
		recollectNodeTree(node, true);
		node = next;
	}
}


/** Apply differences in attributes from a VNode to the given DOM Element.
 *	@param {Element} dom		Element with attributes to diff `attrs` against
 *	@param {Object} attrs		The desired end-state key-value attribute pairs
 *	@param {Object} old			Current/previous attributes (from previous VNode or element's prop cache)
 */
 //dcm: no change from the walk-thru:
 //dcm: - Run thru. any attributes in the previous state but not in the current one & remove them
 //dcm: - then go thru. all the attributes in the current state & set them, filtering out special cases
 //dcm:   of children, innerHTML
 //dcm: old is the map at the ATTR_KEY attribute on the dom node.
function diffAttributes(dom, attrs, old) {
	let name;

	// remove attributes no longer present on the vnode by setting them to undefined
	for (name in old) {
		if (!(attrs && attrs[name]!=null) && old[name]!=null) {
			//dcm: note that old[] is updated. Done to do faster diffing - needs access to vnode property used last time it rendered the DOM node
			//dcm: So responsible for updating the prop cache. "old[name] = undefined" removes this item from the map.
			setAccessor(dom, name, old[name], old[name] = undefined, isSvgMode);
		}
	}

	// add new & update changed attributes
	for (name in attrs) {
		if (name!=='children' && name!=='innerHTML' && (
			//dcm: either it's a new attribute, or...
			!(name in old) || 
				//dcm: its value is not equal to
				attrs[name]!==
					//if it's a DOM form value, because these might have been changed by the user since the last render
					(name==='value' || name==='checked' ? 
						//dcm: then the value on the dom node
						dom[name] : 
						//dcm: otherwise, the previous value of the prop
						old[name]))) {
			// also update old - the map on the dom node.
			setAccessor(dom, name, old[name], old[name] = attrs[name], isSvgMode);
		}
	}
}
