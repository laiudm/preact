import { Component } from '../component';

/** Retains a pool of Components for re-use, keyed on component name.
 *	Note: since component names are not unique or even necessarily available, these are primarily a form of sharding.
 *	@private
 */
const components = {};


/** Reclaim a component for later re-use by the recycler. */
//dcm: so components are now cached for re-use. Previously DOM elements were cached...
export function collectComponent(component) {
	let name = component.constructor.name;
	(components[name] || (components[name] = [])).push(component);
}


/** Create a component. Normalizes differences between PFC's and classful Components. */
//dcm: PFC = stateless Purely Functional Component
export function createComponent(Ctor, props, context) {
	let list = components[Ctor.name],
		inst;

	//dcm: check for a stateful component
	if (Ctor.prototype && Ctor.prototype.render) {
		inst = new Ctor(props, context);
		Component.call(inst, props, context);
	}
	//dcm: otherwise it's PFC. Normalise to a stateful component...
	else {
		inst = new Component(props, context);	//dcm: just create a std Component
		inst.constructor = Ctor;				//dcm: but make it's constructor. Looks like it's just re-using this existing attribute for doRender
		inst.render = doRender;					//dcm: and make the render function doRender() below
	}

	//dcm: this is strange. Supposedly components are being re-used, but a new one has just been created!

	//dcm: the code below instead tries to find a match, and if so, removes it from the cache & updates 
	//dcm: the newly created Component's nextBase. No idea what that is! It appears to be only touched in component.js, so perhaps find out then.
	//dcm: Update: I think what's going on is that nextBase points to the old DOM node associated with a prior instance of the component.
	//dcm: this old DOM node is re-used if possible. So DOM nodes are cached, but not directly and instead indirectly via old recycled components.
	if (list) {
		for (let i=list.length; i--; ) {
			if (list[i].constructor===Ctor) {
				inst.nextBase = list[i].nextBase;
				list.splice(i, 1);
				break;
			}
		}
	}
	return inst;
}


/** The `.render()` method for a PFC backing instance. */
function doRender(props, state, context) {
	return this.constructor(props, context);	//dcm: state isn't relevant to PFCs, so it's left out in the call. constructor has been re-purposed for local use.
}
