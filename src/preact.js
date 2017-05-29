import { h, h as createElement } from './h';
import { cloneElement } from './clone-element';
import { Component } from './component';
import { render } from './render';
import { rerender } from './render-queue';
import options from './options';

//dcm: okay nothing really here, except I don't know the difference between "export default" and "export"
export default {
	h,
	createElement,
	cloneElement,
	Component,
	render,
	rerender,
	options
};

export {
	h,
	createElement,
	cloneElement,
	Component,
	render,
	rerender,
	options
};
