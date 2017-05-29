import { SYNC_RENDER, NO_RENDER, FORCE_RENDER, ASYNC_RENDER, ATTR_KEY } from '../constants';
import options from '../options';
import { extend } from '../util';
import { enqueueRender } from '../render-queue';
import { getNodeProps } from './index';
import { diff, mounts, diffLevel, flushMounts, recollectNodeTree, removeChildren } from './diff';
import { createComponent, collectComponent } from './component-recycler';
import { removeNode } from '../dom';

/** Set a component's `props` (generally derived from JSX attributes).
 *	@param {Object} props
 *	@param {Object} [opts]
 *	@param {boolean} [opts.renderSync=false]	If `true` and {@link options.syncComponentUpdates} is `true`, triggers synchronous rendering.
 *	@param {boolean} [opts.render=true]			If `false`, no render will be triggered.
 */
 //dcm: called in 2x places by renderComponent(), and in 2x places by buildComponentFromVNode()
 //dcm: the opts para has 3x values: NO_RENDER, ASYNC_RENDER, SYNC_RENDER
 //dcm: props.ref appears to be an undocumented feature
export function setComponentProps(component, props, opts, context, mountAll) {
	if (component._disable) return;	//dcm: may be called recursively whilst processing, or during unmounting. If so just short-circuit.
	component._disable = true;

	if ((component.__ref = props.ref)) delete props.ref;	//dcm: it's possible to have a ref property for a component, but it behaves differently to refs for dom nodes
	if ((component.__key = props.key)) delete props.key;	//dcm: the key value for a component is stored on the component instance, whereas key values for dom nodes are stored in the dom nodes [ATTR_KEY]

	if (!component.base || mountAll) {
		if (component.componentWillMount) component.componentWillMount();	//dcm: if it's not already mounted call the lifecycle method
	}
	else if (component.componentWillReceiveProps) {						//dcm: it's already mounted, so just report new props via lifecycle method
		component.componentWillReceiveProps(props, context);
	}

	//dcm: no idea what's happening here TODO
	if (context && context!==component.context) {
		if (!component.prevContext) component.prevContext = component.context;
		component.context = context;
	}

	if (!component.prevProps) component.prevProps = component.props;
	component.props = props;
	
	//dcm: it appears the code above ensures each component has:
	//dcm: 	.context, .prevContext
	//dcm:	.props,   .prevProps
	//dcm: no idea where these are used tho.

	component._disable = false;	//dcm: we're done with the core processing, allow recursion again

	if (opts!==NO_RENDER) {
		//dcm: syncComponentUpdates sets whether children components are re-rendered immediately when the props received from their parent change (see options.js for more)
		if (opts===SYNC_RENDER || options.syncComponentUpdates!==false || !component.base) {
			renderComponent(component, SYNC_RENDER, mountAll);	//dcm: sync render
		}
		else {
			enqueueRender(component);							//dcm: else async render, resulting in a later call: renderComponent(component) -- no extra paras
		}
	}

	//dcm: .__ref was set at the beginning of this method. This is undocumented functionality
	if (component.__ref)
		component.__ref(component);		
}



/** Render a Component, triggering necessary lifecycle events and taking High-Order Components into account.
 *	@param {Component} component
 *	@param {Object} [opts]
 *	@param {boolean} [opts.build=false]		If `true`, component will build and store a DOM node if not already associated with one.
 *	@private
 */

 //dcm: called from:
 //dcm: 	render-queue.rerender() - ie. via the renderQueue; it's called with 			(component)
 //dcm:		src/component.js - called from forceUpdate() - called with 						(component, FORCE_RENDER)
 //dcm:		setComponentProps() - as per the walk-thru diagram 								(component, SYNC_RENDER, mountAll)
 //dcm:		recursively from inside itself: 												(component, SYNC_RENDER, mountAll, true)
export function renderComponent(component, opts, mountAll, isChild) {
	if (component._disable) return;	//dcm: either in the process of unmounting or setting component props, so short-circuit

	let props = component.props,
		state = component.state,
		context = component.context,
		previousProps = component.prevProps || props,
		previousState = component.prevState || state,
		previousContext = component.prevContext || context,
		isUpdate = component.base,				//dcm: this is set to point to the associated dom node, if it's already been created
		nextBase = component.nextBase,			//dcm: this may point to a cached dom node, if this component has been re-created.
		initialBase = isUpdate || nextBase,		//dcm: use either the pre-exisitng dom node, or the cached one
		initialChildComponent = component._component,	//dcm: TODO where is ._component initialised?
		skip = false,
		rendered, inst, cbase;

	// if updating
	//dcm: ie. we already have a dom node associated with the component, so are just updating it.
	if (isUpdate) {
		//dcm: lifecycle methods expect the component's props, state, context to be set to prior to the change ( component _WILL_ update, future tense)
		component.props = previousProps;
		component.state = previousState;
		component.context = previousContext;
		
		//dcm: implement the shouldComponentUpdate() feature. According to the react docs, this lifecycle method is 
		//dcm:   not called on the initial render, or when forceUpdate() is called. 
		//dcm:   On shouldComponentUpdate() returning false, componentWillUpdate(), render(), componentDidUpdate() won't be called.
		if (opts!==FORCE_RENDER
			&& component.shouldComponentUpdate
			&& component.shouldComponentUpdate(props, state, context) === false) {
			skip = true;		//dcm: remember what shouldComponentUpdate() returned.
		}
		//dcm: and call the other lifecycle method.
		else if (component.componentWillUpdate) {
			component.componentWillUpdate(props, state, context);
		}
		
		//dcm: finally restore these to their new values.
		component.props = props;
		component.state = state;
		component.context = context;
	}

	component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
	component._dirty = false;	//dcm: can now mark the component as have been processed, and therefore 'clean'

	if (!skip) {
		//dcm: this is where the component's render() function is called.
		//dcm: rendered will contain the vnode tree returned by render()  & associated with this component.
		rendered = component.render(props, state, context);

		// context to pass to the child, can be updated via (grand-)parent component
		//dcm: react context processing appears to be flawed (since intermediate contexts may have been skipped because shouldComponentUpdate() returned false
		//dcm: otherwise this code is relatively simple - if getChildContext() is defined, add what it returns to the component's context
		if (component.getChildContext) {
			context = extend(extend({}, context), component.getChildContext());
		}

		let childComponent = rendered && rendered.nodeName,	//dcm: look at the top vnode's nodeName. Child because it's the component directly below this component.
			toUnmount, base;

		if (typeof childComponent==='function') {
			//dcm: the vnode is referring to a preact component
			// set up high order component link

			let childProps = getNodeProps(rendered);	//dcm: gets vnode props, but taking account of any set via the associated component's .defaultProps
			inst = initialChildComponent;				//dcm: initialised from component._component

			//dcm: check whether the associated ._component matches. (TODO, check __key)
			if (inst && inst.constructor===childComponent && childProps.key==inst.__key) {
				//dcm: yes, they match. Just set its props (& potentially recursively render its children)
				setComponentProps(inst, childProps, SYNC_RENDER, context, false);
			}
			else {
				//dcm: the associated ._component doesn't match. Mark it for deletion/unmounting
				toUnmount = inst;

				//dcm: and now create a new child component
				component._component = inst = createComponent(childComponent, childProps, context);
				inst.nextBase = inst.nextBase || nextBase;		//dcm: dom node caching/recycling stuff. Not sure why the child's nextBase might be set to the parent's tho.
				inst._parentComponent = component;				//dcm: set up the backwards link
				setComponentProps(inst, childProps, NO_RENDER, context, false);	//dcm: set its props (& potentially recursively render its children), without rendering
				renderComponent(inst, SYNC_RENDER, mountAll, true);				//dcm: now explicitly render the child (and its children). Not sure why it's broken into 2 steps. Maybe because of the last para - this is the only place it's set true
			}

			base = inst.base;	//dcm: base is the associated dom node. set the associated dom node to the dom node of the child.
		}
		else {
			//dcm: the top vnode isn't a function; it must be a string refering to a dom node.
			cbase = initialBase;		//dcm: initialBase is either the associated dom node OR, if that doesn't exist, the cached one 

			// destroy high order component link
			//dcm: mark the child component for deletion
			toUnmount = initialChildComponent;
			if (toUnmount) {
				cbase = component._component = null;
			}

			if (initialBase || opts===SYNC_RENDER) {
				if (cbase) cbase._component = null;
				
				//dcm: this is the call shown in the walk-thru diagram...
				//dcm: paras are (dom, vnode, context, mountAll, parent, componentRoot)
				//dcm: if cbase is null, diff() will create the dom node.
				//dcm: parent = DOM element to render into
				//dcm: diff() returns with the created/mutated dom node
				base = diff(cbase, rendered, context, mountAll || !isUpdate, initialBase && initialBase.parentNode, true);
			}
		}

		//dcm: whew, we've now recursively created/mutated the dom node & components
		//dcm: time to do some housekeeping.
		//dcm: is the associated dom node different from what we started with & the component instance also different?
		if (initialBase && base!==initialBase && inst!==initialChildComponent) {
			//dcm: go up one level in the dom tree
			let baseParent = initialBase.parentNode;
			//dcm: now do they match?
			if (baseParent && base!==baseParent) {
				//dcm: nope - update the DOM, replacing the old DOM node with the new.
				baseParent.replaceChild(base, initialBase);

				//dcm: now recycle the old node, but only if it's not already going to be done via unmounting.
				if (!toUnmount) {
					initialBase._component = null;				//dcm: ensure there's no residual link to the child
					recollectNodeTree(initialBase, false);		//dcm: ...and delete
				}
			}
		}

		//dcm: any node to unmount?
		if (toUnmount) {
			unmountComponent(toUnmount);
		}

		//dcm: base is set to the dom node that's just been created/mutated above
		component.base = base;		//dcm: the only place where .base is set
		
		//dcm: isChild is an entry parameter, and is only set true when this function calls itself recursively
		if (base && !isChild) {
			let componentRef = component,
				t = component;
				
			//dcm: go back up the component tree setting each .base to base (the dom node that's just been created/mutated
			while ((t=t._parentComponent)) {
				(componentRef = t).base = base;
			}
			
			//dcm: set base's attributes to top-most componentRef
			base._component = componentRef;
			base._componentConstructor = componentRef.constructor;
		}
	}

	//dcm: following logic ensures the appropriate lifecycle callbacks are made, and in the right order
	if (!isUpdate || mountAll) {
		mounts.unshift(component);	//dcm: add the component to the beginning of the queue of components that have been mounted and are awaiting componentDidMount
	}
	else if (!skip) {
		// Ensure that pending componentDidMount() hooks of child components
		// are called before the componentDidUpdate() hook in the parent.
		flushMounts();

		if (component.componentDidUpdate) {
			component.componentDidUpdate(previousProps, previousState, previousContext);	//dcm: call lifecycle method
		}
		if (options.afterUpdate) options.afterUpdate(component);	//dcm: optional hook
	}

	//dcm: make any callbacks that were queued from any setState(state, callback) or forceUpdate(callback) 
	if (component._renderCallbacks!=null) {
		while (component._renderCallbacks.length) component._renderCallbacks.pop().call(component);
	}

	//dcm: further logic to ensure all componentDidMount() hooks are called.
	//dcm: reminder - isChild is an entry parameter, and is only set true when this function calls itself recursively
	//dcm: reminder - diffLevel counts the number of recursion levels. So !diffLevel is true only when diffLevel==0, ie top level
	//dcm: on the very initial call e.g. render(h(App, null), document.body) - this results in a call to diff(merge, vnode, {}, false, parent, false)
	//dcm: which immediately increments diffLevel. So !diffLevel will always return false via this route.
	//dcm: the only other real route to cause an update is via a call to setState(), which enqueues a call to this function, with diffLevel=0, ie !diffLevel is true
	//dcm: (for the top level only, as diff() will be called for the lower tree levels
	//dcm: Conclusion: flushMounts is only called here on completion of the top level component rerender caused by a setState()
	if (!diffLevel && !isChild) flushMounts();
}



/** Apply the Component referenced by a VNode to the DOM.
 *	@param {Element} dom	The DOM node to mutate
 *	@param {VNode} vnode	A Component-referencing VNode
 *	@returns {Element} dom	The created/mutated element
 *	@private
 */
 //dcm: called from just one place: vdom/diff.idiff()
 //dcm: touched on in the walk-thru. 
 //dcm: looks for an existing component that corresponds to the vnode, or creates a new one
 //dcm: Once it has a component instance it sets the vnode's attributes as the props 
 //dcm: on that instance by calling setComponentProps()
export function buildComponentFromVNode(dom, vnode, context, mountAll) {
	let c = dom && dom._component,		//dcm: relies on all dom nodes created by preact setting this attribute. c points to a component instance.
		originalComponent = c,
		oldDom = dom,
		isDirectOwner = c && dom._componentConstructor===vnode.nodeName,	//dcm: sim. checking to in vdom/index.isSameNodeType()
		isOwner = isDirectOwner,
		props = getNodeProps(vnode);	//dcm: gets node props, but taking account of any set via .defaultProps
		
	while (c && !isOwner && (c=c._parentComponent)) {	//dcm: work back up the component tree looking for the owner
		isOwner = c.constructor===vnode.nodeName;
	}

	if (c && isOwner && (!mountAll || c._component)) {
		//dcm: yay, found a match; set its props (and in the process, all its children) & we're done
		setComponentProps(c, props, ASYNC_RENDER, context, mountAll);	//dcm: why is this an ASYNC_RENDER, whereas the other call below is SYNC_RENDER?
		dom = c.base;
	}
	else {
		//dcm: nope, didn't find a match, unmount the component (if it exists). 
		if (originalComponent && !isDirectOwner) {
			unmountComponent(originalComponent);
			dom = oldDom = null;	//dcm: ensure it's not recycled below
		}

		//dcm: now create a new component
		c = createComponent(vnode.nodeName, props, context);
		if (dom && !c.nextBase) {
			c.nextBase = dom;	//dcm: chain the old component to the new via the .nextBase attribute
			// passing dom/oldDom as nextBase will recycle it if unused, so bypass recycling on L229:
			oldDom = null;		//dcm: ensure it's not recycled below
		}
		setComponentProps(c, props, SYNC_RENDER, context, mountAll);	//dcm: which calls renderComponent() which calls diff() in massive recursive loop
		dom = c.base;	//dcm: .base is set in renderComponent() above.

		//dcm: check whether we still need to deal with the old dom - it might have been already been dealt with above...
		if (oldDom && dom!==oldDom) {
			oldDom._component = null;			//dcm: not sure why this is needed. Surely once the nodes are deleted these values are never seen again.
			recollectNodeTree(oldDom, false);	//dcm: delete the dom nodes
		}
	}

	return dom;
}



/** Remove a component from the DOM and recycle it.
 *	@param {Component} component	The Component instance to unmount
 *	@private
 */
 //dcm: called from 2x other places above in this file, 1x recursively, and 1x in diff.recollectNodeTree()
export function unmountComponent(component) {
	//dcm: check the options settings. Implements Hook invoked immediately before a component is unmounted. See options.js
	if (options.beforeUnmount) options.beforeUnmount(component);

	let base = component.base;

	component._disable = true;	//dcm: this value is checked by setComponentProps() and renderComponent() above, and if it's set they immed. return.

	if (component.componentWillUnmount) component.componentWillUnmount();	//dcm: call the lifecycle method if it exists

	component.base = null;

	// recursively tear down & recollect high-order component children:
	let inner = component._component;	//dcm: not sure what this is about. _component is set (and cleared) elsewhere in this file, and referred to 3x times in diff
	if (inner) {
		unmountComponent(inner);
	}
	else if (base) {
		//dcm: hmmm base must point to a dom node, as thats where ATTR_KEY is an attribute.
		//dcm: So this is saying that this component being unmounted links to a dom node.
		if (base[ATTR_KEY] && base[ATTR_KEY].ref) base[ATTR_KEY].ref(null);	//dcm: call the ref funtion with null. Same line is in diff.recollectNodeTree(). Smell?

		component.nextBase = base;		//dcm: so nextBase must also be a dom node. Maybe the caching is of dom nodes afterall.

		removeNode(base);				//dcm: remove the dom node from its parent.
		collectComponent(component);	//dcm: this is the only place this function is called. Defined in vdom/component-recycler(). Caches the component rather than delete.

		removeChildren(base);			//dcm: defined in diff. & calls recollectNodeTree() on each child node
	}

	if (component.__ref) component.__ref(null);		//dcm: .__ref was set from the ref attribute during the call to setComponentProps()
}
