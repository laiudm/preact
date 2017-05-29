import { VNode } from './vnode';
import options from './options';


const stack = [];

const EMPTY_CHILDREN = [];

/** JSX/hyperscript reviver
*	Benchmarks: https://esbench.com/bench/57ee8f8e330ab09900a1a1a0
 *	@see http://jasonformat.com/wtf-is-jsx
 *	@public
 */
export function h(nodeName, attributes) {
	let children=EMPTY_CHILDREN, lastSimple, child, simple, i;
	
	//dcm: children can be passed as extra arguments
	for (i=arguments.length; i-- > 2; ) {
		stack.push(arguments[i]);
	}
	
	//dcm: children can also be passed in the 'attributes' para, but shouldn't be actual html attributes
	if (attributes && attributes.children!=null) {
		if (!stack.length) stack.push(attributes.children);
		delete attributes.children;	//dcm: remove so it's not also rendered as a DOM attribute
	}
	
	//dcm: loop until we have flattened and normalised all children
	while (stack.length) {
		//dcm: check whether the child is an array, and if so push al it's elements onto the stack.
		//dcm: note that the method of checking for an array has changed from the walk-thru. (Was child instance of Array)
		if ((child = stack.pop()) && child.pop!==undefined) {
			for (i=child.length; i--; ) stack.push(child[i]);
		}
		else {
			if (child===true || child===false) child = null;		//dcm: skip these. 
			
			//dcm: now coerce each child into something we can render
			//dcm: some of the detailed logic has changed slightly from the walk-thru. e.g. children is pre-initialised
			if ((simple = typeof nodeName!=='function')) {
				if (child==null) child = '';
				else if (typeof child==='number') child = String(child);	//dcm: convert numbers to strings
				else if (typeof child!=='string') simple = false;
			}

			if (simple && lastSimple) {
				children[children.length-1] += child;		//dcm: concatenate adjacent strings & numbers
			}
			else if (children===EMPTY_CHILDREN) {
				children = [child];
			}
			else {
				children.push(child);
			}

			lastSimple = simple;
		}
	}
	
	//dcm: create the node...
	//dcm: attributes now set inline rather in the VNode() call. 
	//dcm: Now specifically check attributes==null where before it was p.attributes = attributes || undefined. Why?? 

	let p = new VNode();
	p.nodeName = nodeName;
	p.children = children;		//dcm: different from walk-thru: no need for a check here as children is now pre-initialised
	p.attributes = attributes==null ? undefined : attributes;
	p.key = attributes==null ? undefined : attributes.key;

	// if a "vnode hook" is defined, pass every created VNode to it
	if (options.vnode!==undefined) options.vnode(p);	//dcm: again, a different test. was "if (options.vnode) options.vnode(p);"

	return p;
}
