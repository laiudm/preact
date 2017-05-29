import options from './options';
import { renderComponent } from './vdom/component';

/** Managed queue of dirty components to be re-rendered */

let items = [];

export function enqueueRender(component) {
	//dcm: if the component is not yet marked as dirty, do so and add it to the queue for re-rendering
	//dcm: if it's the first item added, then schedule a re-render via a call to setTimeout (ignoring debounceRendering)
	if (!component._dirty && (component._dirty = true) && items.push(component)==1) {
		(options.debounceRendering || setTimeout)(rerender);
	}
}


export function rerender() {
	//dcm: actually do the rescheduled rerender.
	//dcm: also called from all sorts of places, including it being part of the react API?
	let p, list = items;
	items = [];
	while ( (p = list.pop()) ) {
		if (p._dirty) renderComponent(p);
	}
}
