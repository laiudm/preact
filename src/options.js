/** Global options
 *	@public
 *	@namespace options {Object}
 */
 
 //dcm - looks identical to the walk-thru code.
 
export default {

	/** If `true`, `prop` changes trigger synchronous component updates.
	 *	@name syncComponentUpdates
	 *	@type Boolean
	 *	@default true
	 */
	 
	 /* dcm: syncComponentUpdates sets whether children components are re-rendered immediately when the props received from their parent change. 
	 *  It defaults to true, which is also the default behavior in React. 
	 *  By setting the option to false, you can delay updates to happen asynchronously, on a schedule you determine. This is 
	 *  especially useful if you are doing animations, where you want to update each child once per frame rather than possibly
	 *  getting bogged down by multiple updates for each child in a single frame. You can see the difference in action with
	 *  this (https://preact-factals.surge.sh/) example of an animating fractal tree. (But be careful: asynchronous rendering may 
	 *  produce some odd behavior, because updates from parent to child happen less predictably. You’ll want to think this through 
	 *  before using it for normal UIs.)
	 */
	//syncComponentUpdates: true,

	/** Processes all created VNodes.
	 *	@param {VNode} vnode	A newly-created VNode to normalize/process
	 */
	 
	 /* dcm: is a callback function that will be called with every new virtual node created by Preact. 
	 *  afterMount(), afterUpdate(), and beforeUnmount() are callbacks that are passed components at the times you would expect.
	 */
	 
	//vnode(vnode) { }

	/** Hook invoked after a component is mounted. */
	// afterMount(component) { }

	/** Hook invoked after the DOM is updated with a component's latest render. */
	// afterUpdate(component) { }

	/** Hook invoked immediately before a component is unmounted. */
	// beforeUnmount(component) { }
	
	/* dcm: Not documented in this file, but useful if you want async rendering, is debounceRendering, which you can set to the 
	*  scheduling function you want to control rendering. If unset, asynchronous renders will be scheduled using the defer
	*  utility function. If you’re playing with asynchronous rendering, requestAnimationFrame is probably what you want.
	*/
	
	/* dcm: These global option callbacks are not intended for use in application code. They’d just make for a maintenance and 
	*  testing nightmare. But they are very useful for Preact internally to interoperate with the React Devtools 
	*  (https://github.com/facebook/react-devtools), a browser extension that lets you inspect a running React app.
    *
	*  The React Devtools work by integrating deeply with React internals like the shape of components, the interface of the 
	*  reconciler, etc. Rather then recreating the Devtools for Preact, the integration in devtools/devtools.js works by 
	*  implementing facades for the bits of React that the Devtools need. The exact details of that code is beyond the scope 
	*  of this series, since it mostly has to do with React internals. But I do want to point out the initialization code at 
	*  the bottom, which uses the global options callbacks to do things like normalize Preact vnodes into the expected shape 
	*  and to notify the interface of changes to rendered components.
	*
	*  In your own applications, you may want to consider setting the options related to asynchronous rendering. But unless 
	*  you’re working on the Preact codebase itself, leave the global callbacks alone.
	*/
};
