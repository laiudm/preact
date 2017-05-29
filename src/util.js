/** Copy own-properties from `props` onto `obj`.
 *	@returns obj
 *	@private
 */
 
 //dcm - dramatically shorter than the walk-thru version. Just 1x function here cf. 7-8 or more.
 //dcm - missing are clone(), delve(), isFunction(), isString(), hashToClassName(), tolowerCase() {memoized version}, resolved, defer
 
 //dcm: simple method of adding methods (props) to a class (obj)
export function extend(obj, props) {
	for (let i in props) obj[i] = props[i];
	return obj;
}


