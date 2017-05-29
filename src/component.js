import { FORCE_RENDER } from './constants';
import { extend } from './util';
import { renderComponent } from './vdom/component';
import { enqueueRender } from './render-queue';

//dcm: described in part 2 of walk-thru.
//dcm: simpler imports - no clone(), isFunction()
//dcm: this file contains the interface and a few required methods, but leaves out many optional lifecycle methods

/** Base Component class.
 *	Provides `setState()` and `forceUpdate()`, which trigger rendering.
 *	@public
 *
 *	@example
 *	class MyFoo extends Component {
 *		render(props, state) {
 *			return <div />;
 *		}
 *	}
 */
export function Component(props, context) {
	this._dirty = true;

	/** @public
	 *	@type {object}
	 */
	this.context = context;

	/** @public
	 *	@type {object}
	 */
	this.props = props;

	/** @public
	 *	@type {object}
	 */
	this.state = this.state || {};	//dcm: slightly simpler code than walk-thru.
	
	/*dcm: there are lots of additional internal/external attributes:
		_disable,					//dcm: either in the process of unmounting or setting component props
		_dirty,						//dcm: set in enqueueRender(), cleared in renderComponent()
		shouldComponentUpdate,		//dcm: lifecycle method. Return false if the component shouldn't update
		componentWillUpdate,		//dcm: lifecycle method
		prevProps,
		prevState,
		base,						//dcm: this is set to point to the associated dom node
		nextBase,
		getChildContext,
		_component,					//dcm: the child component to this component
		_parentComponent,			//dcm: the parent component to this component
		
	*/
}


extend(Component.prototype, {

	/** Returns a `boolean` indicating if the component should re-render when receiving the given `props` and `state`.
	 *	@param {object} nextProps
	 *	@param {object} nextState
	 *	@param {object} nextContext
	 *	@returns {Boolean} should the component re-render
	 *	@name shouldComponentUpdate
	 *	@function
	 */
	 //dcm: shouldComponentUpdate() may be overridden in the components you write
	 
	 //dcm: linkState() removed


	/** Update component state by copying properties from `state` to `this.state`.
	 *	@param {object} state		A hash of state properties to update with new values
	 *	@param {function} callback	A function to be called once component state is updated
	 */
	 //dcm: merges new state values into the component's existing state, then queues the 
	 //dcm: the component to be rendered asynch. 
	setState(state, callback) {
		let s = this.state;
		if (!this.prevState) this.prevState = extend({}, s);	//dcm: make a copy of the state
		extend(s, typeof state==='function' ? state(s, this.props) : state); //dcm: update s & therefore this.state
		if (callback) (this._renderCallbacks = (this._renderCallbacks || [])).push(callback); //dcm: add to the callback queue
		enqueueRender(this);
	},


	/** Immediately perform a synchronous re-render of the component.
	 *	@param {function} callback		A function to be called after component is re-rendered.
	 *	@private
	 */
	 //dcm: forces a synch render of the component
	forceUpdate(callback) {
		if (callback) (this._renderCallbacks = (this._renderCallbacks || [])).push(callback); //dcm: identical to code in setState()
		renderComponent(this, FORCE_RENDER);
	},


	/** Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
	 *	Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
	 *	@param {object} props		Props (eg: JSX attributes) received from parent element/component
	 *	@param {object} state		The component's current state
	 *	@param {object} context		Context object (if a parent component has provided context)
	 *	@returns VNode
	 */
	render() {}
	 //dcm: render() may be overridden in the components you write

});
