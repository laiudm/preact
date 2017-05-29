// render modes

export const NO_RENDER = 0;
export const SYNC_RENDER = 1;
export const FORCE_RENDER = 2;
export const ASYNC_RENDER = 3;

//dcm: name given to the attribute in the DOM element that holds the prop cache.
//dcm: it appears that this attribute is overloaded; sometimes it has the value true, other times a map(?)
export const ATTR_KEY = '__preactattr_';	

// DOM properties that should NOT have "px" added when numeric
//dcm: referenced by dom/index.js:
export const IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|ows|mnc|ntw|ine[ch]|zoo|^ord/i;

//dcm: removed list of DOM event types that do not bubble and should be attached via useCapture
//dcm: I suspect this is now put in the hands of the user, by the new function allowing "Capture" in the name

