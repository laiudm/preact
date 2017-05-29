import { IS_NON_DIMENSIONAL } from '../constants';
import options from '../options';

//dcm: removed NON_BUBBLING_EVENTS,toLowerCase, isString, isFunction, hashToClassName from walk-thru version

/** Create an element with the given nodeName.
 *	@param {String} nodeName
 *	@param {Boolean} [isSvg=false]	If `true`, creates an element within the SVG namespace.
 *	@returns {Element} node
 */
 //dcm: this is a new function c.f. walk-thru.
 //dcm: was in recycler.js, but that file is no more as there is no longer any DOM node recycling.
 //dcm: note too that the code no longer turns the nodeName into lower-case.
export function createNode(nodeName, isSvg) {
	let node = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', nodeName) : document.createElement(nodeName);
	node.normalizedNodeName = nodeName;
	return node;
}


/** Remove a child node from its parent if attached.
 *	@param {Element} node		The node to remove
 */
 //dcm: no changes - but called directly, not via collectNode(), which previously cached the DOM nodes.
export function removeNode(node) {
	let parentNode = node.parentNode;
	if (parentNode) parentNode.removeChild(node);
}


/** Set a named attribute on the given Node, with special behavior for some names and event handlers.
 *	If `value` is `null`, the attribute/handler will be removed.
 *	@param {Element} node	An element to mutate
 *	@param {string} name	The name/key to set, such as an event or attribute name
 *	@param {any} old	The last value that was set for this name/node pair
 *	@param {any} value	An attribute value, such as a function to be used as an event handler //dcm: ie new value
 *	@param {Boolean} isSvg	Are we currently diffing inside an svg?
 *	@private
 */
 //dcm: sets an arbitrary key/value pair from a vnode's props onto a real DOM node.
 //dcm: called 2x in diff.diffAttributes(), which is just called by idiff()
export function setAccessor(node, name, old, value, isSvg) {
	if (name==='className') name = 'class';	// normalise so both className, class work


	if (name==='key') {	//dcm: key attribute is used by diffing algorithm & mustn't be put on the DOM
		// ignore
	}
	else if (name==='ref') {		//dcm: implement the ref callback feature
		if (old) old(null);		//dcm: the ref has changed; call the old one with a null to clear it
		if (value) value(node);	//dcm: now call the new ref function with the node
	}
	else if (name==='class' && !isSvg) {
		node.className = value || '';	//dcm: we're setting the class, so just set it as it's already normalised to a string
	}
	else if (name==='style') { //dcm: 1st clear old styles & then set new via either string or object of prop/value pairs
		if (!value || typeof value==='string' || typeof old==='string') {
			node.style.cssText = value || '';
		}
		if (value && typeof value==='object') {
			if (typeof old!=='string') {
				for (let i in old) if (!(i in value)) node.style[i] = '';
			}
			for (let i in value) {
				//dcm: IS_NON_DIMENSIONAL checks allow numeric values like {width: 10} & 'px' will be automatically added.
				node.style[i] = typeof value[i]==='number' && IS_NON_DIMENSIONAL.test(i)===false ? (value[i]+'px') : value[i];
			}
		}
	}
	else if (name==='dangerouslySetInnerHTML') {
		if (value) node.innerHTML = value.__html || '';
	}
	else if (name[0]=='o' && name[1]=='n') {	//dcm: setting event handler optimisation
		//dcm: don't want to re-set event handlers each time we render (expensive). instead,
		//dcm: save a map from event names to user-defined handlers on the DOM as node._listeners.
		//dcm: Then we only add/remove DOM event listeners if the set of events being listened to changes
		//dcm: actual event handler attached to the DOM is just eventProxy(), defined below
		//dcm: this code is slightly different to the walk-thru.
		//dcm: new functionality - if the event Handler has "Capture" in it, set the useCapture bool in addEventListener()
		//dcm: this new functionality replaces NON_BUBBLING_EVENTS list, putting useCapture in the hands of the user
		let useCapture = name !== (name=name.replace(/Capture$/, ''));
		name = name.toLowerCase().substring(2);	//dcm: used to use a utility that would memoize the result. Guess not really needed
		if (value) {
			if (!old) node.addEventListener(name, eventProxy, useCapture);
		}
		else {
			node.removeEventListener(name, eventProxy, useCapture);
		}
		(node._listeners || (node._listeners = {}))[name] = value;	//dcm: add the handler to the map, creating it 1st if necessary
	}
	else if (name!=='list' && name!=='type' && !isSvg && name in node) { //dcm: it's a plain DOM property
		setProperty(node, name, value==null ? '' : value);
		if (value==null || value===false) node.removeAttribute(name);	//dcm: if the value is null/undefined/false, remove it
	}
	else {	//dcm: final case deals with SVG attributes, which use special namespace-aware attribute methods.
		let ns = isSvg && (name !== (name = name.replace(/^xlink\:?/, '')));
		if (value==null || value===false) {
			if (ns) node.removeAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase());
			else node.removeAttribute(name);
		}
		else if (typeof value!=='function') {
			if (ns) node.setAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase(), value);
			else node.setAttribute(name, value);
		}
	}
}


/** Attempt to set a DOM property to the given value.
 *	IE & FF throw for certain property-value combinations.
 */
 //dcm: no change
function setProperty(node, name, value) {
	try {
		node[name] = value;
	} catch (e) { }
}


/** Proxy an event to hooked event handlers
 *	@private
 */
 //dcm: wrapper for DOM event handlers that exposes a global hook. The indirection is helpful
 //dcm: no change
function eventProxy(e) {
	return this._listeners[e.type](options.event && options.event(e) || e);
}
