import { extend } from './util';
import { h } from './h';

export function cloneElement(vnode, props) {
	//dcm: one of preact/reacts API calls
	return h(
		vnode.nodeName,
		extend(extend({}, vnode.attributes), props),
		arguments.length>2 ? [].slice.call(arguments, 2) : vnode.children	//dcm: hmm, cloneElement discards vnode.children if add. paras provided
	);
}
