/*
========================================
Meteor is licensed under the MIT License
========================================

Copyright (C) 2011--2012 Meteor Development Group

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


====================================================================
This license applies to all code in Meteor that is not an externally
maintained library. Externally maintained libraries have their own
licenses, included below:
====================================================================

*/

const LocalCollection = {};
const EJSON = require("./EJSON");
const _ = require("lodash");

// Like _.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as
// arrays.
const isArray = function (x) {
  return _.isArray(x) && !EJSON.isBinary(x);
};

const _anyIfArray = function (x, f) {
  if (isArray(x)) return _.some(x, f);
  return f(x);
};

const _anyIfArrayPlus = function (x, f) {
  if (f(x)) return true;
  return isArray(x) && _.some(x, f);
};

const hasOperators = function (valueSelector) {
  let theseAreOperators = undefined;
  for (let selKey in valueSelector) {
    const thisIsOperator = selKey.substr(0, 1) === "$";
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      throw new Error("Inconsistent selector: " + valueSelector);
    }
  }
  return !!theseAreOperators; // {} has no operators
};

const compileValueSelector = function (valueSelector) {
  if (valueSelector == null) {
    // undefined or null
    return function (value) {
      return _anyIfArray(value, function (x) {
        return x == null; // undefined or null
      });
    };
  }

  // Selector is a non-null primitive (and not an array or RegExp either).
  if (!_.isObject(valueSelector)) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return x === valueSelector;
      });
    };
  }

  if (valueSelector instanceof RegExp) {
    return function (value) {
      if (value === undefined) return false;
      return _anyIfArray(value, function (x) {
        return valueSelector.test(x);
      });
    };
  }

  // Arrays match either identical arrays or arrays that contain it as a value.
  if (isArray(valueSelector)) {
    return function (value) {
      if (!isArray(value)) return false;
      return _anyIfArrayPlus(value, function (x) {
        return LocalCollection._f._equal(valueSelector, x);
      });
    };
  }

  // It's an object, but not an array or regexp.
  if (hasOperators(valueSelector)) {
    const operatorFunctions = [];
    _.each(valueSelector, function (operand, operator) {
      if (!_.has(VALUE_OPERATORS, operator))
        throw new Error("Unrecognized operator: " + operator);
      operatorFunctions.push(
        VALUE_OPERATORS[operator](operand, valueSelector.$options)
      );
    });
    return function (value) {
      return _.every(operatorFunctions, function (f) {
        return f(value);
      });
    };
  }

  // It's a literal; compare value (or element of value array) directly to the
  // selector.
  return function (value) {
    return _anyIfArray(value, function (x) {
      return LocalCollection._f._equal(valueSelector, x);
    });
  };
};

// XXX can factor out common logic below
const LOGICAL_OPERATORS = {
  $and: function (subSelector) {
    if (!isArray(subSelector) || _.isEmpty(subSelector))
      throw Error("$and/$or/$nor must be nonempty array");
    const subSelectorFunctions = _.map(subSelector, compileDocumentSelector);
    return function (doc) {
      return _.every(subSelectorFunctions, function (f) {
        return f(doc);
      });
    };
  },

  $or: function (subSelector) {
    if (!isArray(subSelector) || _.isEmpty(subSelector))
      throw Error("$and/$or/$nor must be nonempty array");
    const subSelectorFunctions = _.map(subSelector, compileDocumentSelector);
    return function (doc) {
      return _.some(subSelectorFunctions, function (f) {
        return f(doc);
      });
    };
  },

  $nor: function (subSelector) {
    if (!isArray(subSelector) || _.isEmpty(subSelector))
      throw Error("$and/$or/$nor must be nonempty array");
    const subSelectorFunctions = _.map(subSelector, compileDocumentSelector);
    return function (doc) {
      return _.every(subSelectorFunctions, function (f) {
        return !f(doc);
      });
    };
  },

  $where: function (selectorValue) {
    if (!(selectorValue instanceof Function)) {
      // NOTE: replaced Function("return " + selectorValue); with
      // a closure to avoid any eval issues at all
      selectorValue = () => selectorValue;
    }
    return function (doc) {
      return selectorValue.call(doc);
    };
  },
};

const VALUE_OPERATORS = {
  $in: function (operand) {
    if (!isArray(operand)) throw new Error("Argument to $in must be array");
    return function (value) {
      return _anyIfArrayPlus(value, function (x) {
        return _.some(operand, function (operandElt) {
          return LocalCollection._f._equal(operandElt, x);
        });
      });
    };
  },

  $all: function (operand) {
    if (!isArray(operand)) throw new Error("Argument to $all must be array");
    return function (value) {
      if (!isArray(value)) return false;
      return _.every(operand, function (operandElt) {
        return _.some(value, function (valueElt) {
          return LocalCollection._f._equal(operandElt, valueElt);
        });
      });
    };
  },

  $lt: function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) < 0;
      });
    };
  },

  $lte: function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) <= 0;
      });
    };
  },

  $gt: function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) > 0;
      });
    };
  },

  $gte: function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) >= 0;
      });
    };
  },

  $ne: function (operand) {
    return function (value) {
      return !_anyIfArrayPlus(value, function (x) {
        return LocalCollection._f._equal(x, operand);
      });
    };
  },

  $nin: function (operand) {
    if (!isArray(operand)) throw new Error("Argument to $nin must be array");
    const inFunction = VALUE_OPERATORS.$in(operand);
    return function (value) {
      // Field doesn't exist, so it's not-in operand
      if (value === undefined) return true;
      return !inFunction(value);
    };
  },

  $exists: function (operand) {
    return function (value) {
      return operand === (value !== undefined);
    };
  },

  $mod: function (operand) {
    const divisor = operand[0],
      remainder = operand[1];
    return function (value) {
      return _anyIfArray(value, function (x) {
        return x % divisor === remainder;
      });
    };
  },

  $size: function (operand) {
    return function (value) {
      return isArray(value) && operand === value.length;
    };
  },

  $type: function (operand) {
    return function (value) {
      // A nonexistent field is of no type.
      if (value === undefined) return false;
      // Definitely not _anyIfArrayPlus: $type: 4 only matches arrays that have
      // arrays as elements according to the Mongo docs.
      // TODO this should now be supported
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._type(x) === operand;
      });
    };
  },

  $regex: function (operand, options) {
    if (options !== undefined) {
      // Options passed in $options (even the empty string) always overrides
      // options in the RegExp object itself.

      // Be clear that we only support the JS-supported options, not extended
      // ones (eg, Mongo supports x and s). Ideally we would implement x and s
      // by transforming the regexp, but not today...
      if (/[^gim]/.test(options))
        throw new Error("Only the i, m, and g regexp options are supported");

      const regexSource = operand instanceof RegExp ? operand.source : operand;
      operand = new RegExp(regexSource, options);
    } else if (!(operand instanceof RegExp)) {
      operand = new RegExp(operand);
    }

    return function (value) {
      if (value === undefined) return false;
      return _anyIfArray(value, function (x) {
        return operand.test(x);
      });
    };
  },

  $options: function (operand) {
    // evaluation happens at the $regex function above
    return function (value) {
      return true;
    };
  },

  $elemMatch: function (operand) {
    const matcher = compileDocumentSelector(operand);
    return function (value) {
      if (!isArray(value)) return false;
      return _.some(value, function (x) {
        return matcher(x);
      });
    };
  },

  $not: function (operand) {
    const matcher = compileValueSelector(operand);
    return function (value) {
      return !matcher(value);
    };
  },

  $near: function (operand) {
    // Always returns true. Must be handled in post-filter/sort/limit
    return function (value) {
      return true;
    };
  },

  $geoIntersects: function (operand) {
    // Always returns true. Must be handled in post-filter/sort/limit
    return function (value) {
      return true;
    };
  },
};

// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..

  _type: function (v) {
    if (typeof v === "number") return 1;
    if (typeof v === "string") return 2;
    if (typeof v === "boolean") return 8;
    if (isArray(v)) return 4;
    if (v === null) return 10;
    if (v instanceof RegExp) return 11;
    if (typeof v === "function")
      // note that typeof(/x/) === "function"
      return 13;
    if (v instanceof Date) return 9;
    if (EJSON.isBinary(v)) return 5;
    return 3; // object

    // XXX support some/all of these:
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  },

  // deep equality test: use for literal document and array matches
  _equal: function (a, b) {
    return EJSON.equals(a, b, { keyOrderSensitive: true });
  },

  // maps a type code to a value that can be used to sort values of
  // different types
  _typeorder: function (t) {
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
    // XXX what is the correct sort position for Javascript code?
    // ('100' in the matrix below)
    // XXX minkey/maxkey
    return [
      -1, // (not a type)
      1, // number
      2, // string
      3, // object
      4, // array
      5, // binary
      -1, // deprecated
      6, // ObjectID
      7, // bool
      8, // Date
      0, // null
      9, // RegExp
      -1, // deprecated
      100, // JS code
      2, // deprecated (symbol)
      100, // JS code
      1, // 32-bit int
      8, // Mongo timestamp
      1, // 64-bit int
    ][t];
  },

  // compare two values of unknown type according to BSON ordering
  // semantics. (as an extension, consider 'undefined' to be less than
  // any other value.) return negative if a is less, positive if b is
  // less, or 0 if equal
  _cmp: function (a, b) {
    let i;
    if (a === undefined) return b === undefined ? 0 : -1;
    if (b === undefined) return 1;
    let ta = LocalCollection._f._type(a);
    let tb = LocalCollection._f._type(b);
    const oa = LocalCollection._f._typeorder(ta);
    const ob = LocalCollection._f._typeorder(tb);
    if (oa !== ob) return oa < ob ? -1 : 1;
    if (ta !== tb)
      // XXX need to implement this if we implement Symbol or integers, or
      // Timestamp
      throw Error("Missing type coercion logic in _cmp");
    if (ta === 7) {
      // ObjectID
      // Convert to string.
      ta = tb = 2;
      a = a.toHexString();
      b = b.toHexString();
    }
    if (ta === 9) {
      // Date
      // Convert to millis.
      ta = tb = 1;
      a = a.getTime();
      b = b.getTime();
    }

    if (ta === 1)
      // double
      return a - b;
    if (tb === 2)
      // string
      return a < b ? -1 : a === b ? 0 : 1;
    if (ta === 3) {
      // Object
      // this could be much more efficient in the expected case ...
      const to_array = function (obj) {
        const ret = [];
        for (let key in obj) {
          ret.push(key);
          ret.push(obj[key]);
        }
        return ret;
      };
      return LocalCollection._f._cmp(to_array(a), to_array(b));
    }
    if (ta === 4) {
      // Array
      for (i = 0; ; i++) {
        if (i === a.length) return i === b.length ? 0 : -1;
        if (i === b.length) return 1;
        const s = LocalCollection._f._cmp(a[i], b[i]);
        if (s !== 0) return s;
      }
    }
    if (ta === 5) {
      // binary
      // Surprisingly, a small binary blob is always less than a large one in
      // Mongo.
      if (a.length !== b.length) return a.length - b.length;
      for (i = 0; i < a.length; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
      }
      return 0;
    }
    if (ta === 8) {
      // boolean
      if (a) return b ? 0 : 1;
      return b ? -1 : 0;
    }
    if (ta === 10)
      // null
      return 0;
    if (ta === 11)
      // regexp
      throw Error("Sorting not supported on regular expression"); // XXX
    // 13: javascript code
    // 14: symbol
    // 15: javascript code with scope
    // 16: 32-bit integer
    // 17: timestamp
    // 18: 64-bit integer
    // 255: minkey
    // 127: maxkey
    if (ta === 13) {
      // javascript code
      throw Error("Sorting not supported on Javascript code"); // XXX
    }
    throw Error("Unknown type to sort");
  },
};

// _makeLookupFunction(key) returns a lookup function.
//
// A lookup function takes in a document and returns an array of matching
// values.  This array has more than one element if any segment of the key other
// than the last one is an array.  ie, any arrays found when doing non-final
// lookups result in this function "branching"; each element in the returned
// array represents the value found at this branch. If any branch doesn't have a
// final value for the full key, its element in the returned list will be
// undefined. It always returns a non-empty array.
//
// _makeLookupFunction('a.x')({a: {x: 1}}) returns [1]
// _makeLookupFunction('a.x')({a: {x: [1]}}) returns [[1]]
// _makeLookupFunction('a.x')({a: 5})  returns [undefined]
// _makeLookupFunction('a.x')({a: [{x: 1},
//                                 {x: [2]},
//                                 {y: 3}]})
//   returns [1, [2], undefined]
LocalCollection._makeLookupFunction = function (key) {
  const dotLocation = key.indexOf(".");
  let first, lookupRest, nextIsNumeric;
  if (dotLocation === -1) {
    first = key;
  } else {
    first = key.substr(0, dotLocation);
    const rest = key.substr(dotLocation + 1);
    lookupRest = LocalCollection._makeLookupFunction(rest);
    // Is the next (perhaps final) piece numeric (ie, an array lookup?)
    nextIsNumeric = /^\d+(\.|$)/.test(rest);
  }

  return function (doc) {
    if (doc == null)
      // null or undefined
      return [undefined];
    let firstLevel = doc[first];

    // We don't "branch" at the final level.
    if (!lookupRest) return [firstLevel];

    // It's an empty array, and we're not done: we won't find anything.
    if (isArray(firstLevel) && firstLevel.length === 0) return [undefined];

    // For each result at this level, finish the lookup on the rest of the key,
    // and return everything we find. Also, if the next result is a number,
    // don't branch here.
    //
    // Technically, in MongoDB, we should be able to handle the case where
    // objects have numeric keys, but Mongo doesn't actually handle this
    // consistently yet itself, see eg
    // https://jira.mongodb.org/browse/SERVER-2898
    // https://github.com/mongodb/mongo/blob/master/jstests/array_match2.js
    if (!isArray(firstLevel) || nextIsNumeric) firstLevel = [firstLevel];
    return Array.prototype.concat.apply([], _.map(firstLevel, lookupRest));
  };
};

/**
 * The main compilation function for a given selector.
 * TODO make $elemMatch to work with value operators
 * @param docSelector
 * @return {function(*=): boolean}
 */
function compileDocumentSelector(docSelector) {
  const perKeySelectors = [];
  _.each(docSelector, function (subSelector, key) {
    if (key.substr(0, 1) === "$") {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!_.has(LOGICAL_OPERATORS, key))
        throw new Error("Unrecognized logical operator: " + key);
      perKeySelectors.push(LOGICAL_OPERATORS[key](subSelector));
    } else {
      const lookUpByIndex = LocalCollection._makeLookupFunction(key);
      const valueSelectorFunc = compileValueSelector(subSelector);
      perKeySelectors.push(function (doc) {
        const branchValues = lookUpByIndex(doc);
        // We apply the selector to each "branched" value and return true if any
        // match. This isn't 100% consistent with MongoDB; eg, see:
        // https://jira.mongodb.org/browse/SERVER-8585
        return _.some(branchValues, valueSelectorFunc);
      });
    }
  });

  return function (doc) {
    return _.every(perKeySelectors, function (f) {
      return f(doc);
    });
  };
}

/**
 * Give a sort spec, which can be in any of these forms:
 *   {"key1": 1, "key2": -1}
 *   [["key1", "asc"], ["key2", "desc"]]
 *   ["key1", ["key2", "desc"]]
 *
 * (.. with the first form being dependent on the key enumeration
 * behavior of your javascript VM, which usually does what you mean in
 * this case if the key names don't look like integers ..)
 *
 * return a function that takes two objects, and returns -1 if the
 * first object comes first in order, 1 if the second object comes
 * first, or 0 if neither object comes before the other.
 * @param spec
 * @return {*}
 * @private
 */

LocalCollection._compileSort = function compileSort(spec) {
  const sortSpecParts = [];

  if (spec instanceof Array) {
    for (let i = 0; i < spec.length; i++) {
      if (typeof spec[i] === "string") {
        sortSpecParts.push({
          lookup: LocalCollection._makeLookupFunction(spec[i]),
          ascending: true,
        });
      } else {
        sortSpecParts.push({
          lookup: LocalCollection._makeLookupFunction(spec[i][0]),
          ascending: spec[i][1] !== "desc",
        });
      }
    }
  } else if (typeof spec === "object" && spec !== null) {
    for (let key in spec) {
      sortSpecParts.push({
        lookup: LocalCollection._makeLookupFunction(key),
        ascending: spec[key] >= 0,
      });
    }
  } else {
    throw Error("Bad sort specification: ", JSON.stringify(spec));
  }

  if (sortSpecParts.length === 0)
    return function () {
      return 0;
    };

  // reduceValue takes in all the possible values for the sort key along various
  // branches, and returns the min or max value (according to the bool
  // findMin). Each value can itself be an array, and we look at its values
  // too. (ie, we do a single level of flattening on branchValues, then find the
  // min/max.)
  const reduceValue = function (branchValues, findMin) {
    let reduced;
    let first = true;
    // Iterate over all the values found in all the branches, and if a value is
    // an array itself, iterate over the values in the array separately.
    _.each(branchValues, function (branchValue) {
      // Value not an array? Pretend it is.
      if (!isArray(branchValue)) {
        branchValue = [branchValue];
      }
      // Value is an empty array? Pretend it was missing, since that's where it
      // should be sorted.
      if (isArray(branchValue) && branchValue.length === 0) {
        branchValue = [undefined];
      }

      _.each(branchValue, function (value) {
        // We should get here at least once: lookup functions return non-empty
        // arrays, so the outer loop runs at least once, and we prevented
        // branchValue from being an empty array.
        if (first) {
          reduced = value;
          first = false;
        } else {
          // Compare the value we found to the value we found so far, saving it
          // if it's less (for an ascending sort) or more (for a descending
          // sort).
          const cmp = LocalCollection._f._cmp(reduced, value);
          if ((findMin && cmp > 0) || (!findMin && cmp < 0)) reduced = value;
        }
      });
    });
    return reduced;
  };

  return function (a, b) {
    for (let i = 0; i < sortSpecParts.length; ++i) {
      const specPart = sortSpecParts[i];
      const aValue = reduceValue(specPart.lookup(a), specPart.ascending);
      const bValue = reduceValue(specPart.lookup(b), specPart.ascending);
      const compare = LocalCollection._f._cmp(aValue, bValue);
      if (compare !== 0) return specPart.ascending ? compare : -compare;
    }
    return 0;
  };
};

exports.compileDocumentSelector = compileDocumentSelector;
exports.compileSort = LocalCollection._compileSort;
