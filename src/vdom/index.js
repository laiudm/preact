import { extend } from '../util';


/** Check if two nodes are equivalent.
 *	@param {Element} node
 *	@param {VNode} vnode
 *	@private
 */
 //dcm: only called from one place in vdom/diff
export function isSameNodeType(node, vnode, hydrating) {
	if (typeof vnode==='string' || typeof vnode==='number') {
		//dcm: not sure why the function would be called with vnode not actually a vnode...
		//dcm: splitText is a function that's only associated with a TextNode
		//dcm: so the following is a simple way to confirm that the associated dom node is a TextNode.
		return node.splitText!==undefined;	
	}
	if (typeof vnode.nodeName==='string') {
		//dcm: the vnode is to create an html element...
		//dcm: _componentConstructor is only ever set in vdom/component/renderComponent()
		//dcm: I think the following checks whether the dom node has been created at the top level
		//dcm: of a Component rendering???? TODO - find out once I've read thru. vdom/component
		//dcm: returns if it's a simple DOM element, AND the names match
		return !node._componentConstructor && isNamedNode(node, vnode.nodeName);
	}
	//dcm: to get here the vnode must be a component reference. If it's the first time it's being created (hydrating),
	//dcm: then just say it's the same, otherwise verify that the constructor is that of the component.
	return hydrating || node._componentConstructor===vnode.nodeName;
}


/** Check if an Element has a given normalized name.
*	@param {Element} node
*	@param {String} nodeName
 */
 //dcm: normalizedNodeName is a preact-specific attribute attached to the DOM node at the time of creation (in dom/index/createNode()
 //dcm: not sure why it would be different from nodeName - possibly browser-specific nasties
export function isNamedNode(node, nodeName) {
	return node.normalizedNodeName===nodeName || node.nodeName.toLowerCase()===nodeName.toLowerCase();
}


/**
 * Reconstruct Component-style `props` from a VNode.
 * Ensures default/fallback values from `defaultProps`:
 * Own-properties of `defaultProps` not present in `vnode.attributes` are added.
 * @param {VNode} vnode
 * @returns {Object} props
 */
 //dcm: called in a couple of places from vdom/component
 //dcm: looks like a user can define defaultProps in their component class. See: https://jsfiddle.net/developit/2vtwzbng/7/
 //dcm: note jsfiddle doesn't work; need to delete the jsx directive even tho. it's in a comment
 //dcm: here's a more recent jsfiddle (but addressing something else; useful for comparison. https://jsfiddle.net/developit/kL2uuzse/ 
export function getNodeProps(vnode) {
	let props = extend({}, vnode.attributes);
	props.children = vnode.children;

	let defaultProps = vnode.nodeName.defaultProps;
	if (defaultProps!==undefined) {
		for (let i in defaultProps) {
			if (props[i]===undefined) {
				props[i] = defaultProps[i];
			}
		}
	}

	return props;
}
