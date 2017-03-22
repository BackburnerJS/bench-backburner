define('backburner', ['exports'], function (exports) { 'use strict';

var NUMBER = /\d+/;
var now = Date.now;
function each(collection, callback) {
    for (var i = 0; i < collection.length; i++) {
        callback(collection[i]);
    }
}
function isString(suspect) {
    return typeof suspect === 'string';
}
function isFunction(suspect) {
    return typeof suspect === 'function';
}
function isNumber(suspect) {
    return typeof suspect === 'number';
}
function isCoercableNumber(suspect) {
    return isNumber(suspect) || NUMBER.test(suspect);
}
function noSuchQueue(name) {
    throw new Error(("You attempted to schedule an action in a queue (" + name + ") that doesn't exist"));
}
function noSuchMethod(name) {
    throw new Error(("You attempted to schedule an action in a queue (" + name + ") for a method that doesn't exist"));
}
function getOnError(options) {
    return options.onError || (options.onErrorTarget && options.onErrorTarget[options.onErrorMethod]);
}
function findDebouncee(target, method, debouncees) {
    return findItem(target, method, debouncees);
}
function findThrottler(target, method, throttlers) {
    return findItem(target, method, throttlers);
}
function findItem(target, method, collection) {
    var item;
    var index = -1;
    for (var i = 0, l = collection.length; i < l; i++) {
        item = collection[i];
        if (item[0] === target && item[1] === method) {
            index = i;
            break;
        }
    }
    return index;
}

function binarySearch(time, timers) {
    var start = 0;
    var end = timers.length - 2;
    var middle;
    var l;
    while (start < end) {
        // since timers is an array of pairs 'l' will always
        // be an integer
        l = (end - start) / 2;
        // compensate for the index in case even number
        // of pairs inside timers
        middle = start + l - (l % 2);
        if (time >= timers[middle]) {
            start = middle + 2;
        }
        else {
            end = middle;
        }
    }
    return (time >= timers[start]) ? start + 2 : start;
}

var Queue = function Queue(name, options, globalOptions) {
    this.name = name;
    this.globalOptions = globalOptions || {};
    this.options = options;
    this._queue = [];
    this.targetQueues = {};
    this._queueBeingFlushed = undefined;
};
Queue.prototype.push = function push (target, method, args, stack) {
    var queue = this._queue;
    queue.push(target, method, args, stack);
    return {
        queue: this,
        target: target,
        method: method
    };
};
Queue.prototype.pushUnique = function pushUnique (target, method, args, stack) {
    var KEY = this.globalOptions.GUID_KEY;
    if (target && KEY) {
        var guid = target[KEY];
        if (guid) {
            return this.pushUniqueWithGuid(guid, target, method, args, stack);
        }
    }
    this.pushUniqueWithoutGuid(target, method, args, stack);
    return {
        queue: this,
        target: target,
        method: method
    };
};
Queue.prototype.flush = function flush (sync) {
    var queue = this._queue;
    var length = queue.length;
    if (length === 0) {
        return;
    }
    var globalOptions = this.globalOptions;
    var options = this.options;
    var before = options && options.before;
    var after = options && options.after;
    var onError = globalOptions.onError || (globalOptions.onErrorTarget &&
        globalOptions.onErrorTarget[globalOptions.onErrorMethod]);
    var target;
    var method;
    var args;
    var errorRecordedForStack;
    var invoke = onError ? this.invokeWithOnError : this.invoke;
    this.targetQueues = Object.create(null);
    var queueItems = this._queueBeingFlushed = this._queue;
    this._queue = [];
    if (before) {
        before();
    }
    for (var i = 0; i < length; i += 4) {
        target = queueItems[i];
        method = queueItems[i + 1];
        args = queueItems[i + 2];
        errorRecordedForStack = queueItems[i + 3]; // Debugging assistance
        if (isString(method)) {
            method = target[method];
        }
        // method could have been nullified / canceled during flush
        if (method) {
            //
            //** Attention intrepid developer **
            //
            //To find out the stack of this task when it was scheduled onto
            //the run loop, add the following to your app.js:
            //
            //Ember.run.backburner.DEBUG = true; // NOTE: This slows your app, don't leave it on in production.
            //
            //Once that is in place, when you are at a breakpoint and navigate
            //here in the stack explorer, you can look at `errorRecordedForStack.stack`,
            //which will be the captured stack when this job was scheduled.
            //
            //One possible long-term solution is the following Chrome issue:
            //   https://bugs.chromium.org/p/chromium/issues/detail?id=332624
            //
            invoke(target, method, args, onError, errorRecordedForStack);
        }
    }
    if (after) {
        after();
    }
    this._queueBeingFlushed = undefined;
    if (sync !== false &&
        this._queue.length > 0) {
        // check if new items have been added
        this.flush(true);
    }
};
Queue.prototype.cancel = function cancel (actionToCancel) {
    var queue = this._queue;
    var currentTarget;
    var currentMethod;
    var i;
    var l;
    var target = actionToCancel.target;
        var method = actionToCancel.method;
    var GUID_KEY = this.globalOptions.GUID_KEY;
    if (GUID_KEY && this.targetQueues && target) {
        var targetQueue = this.targetQueues[target[GUID_KEY]];
        if (targetQueue) {
            for (i = 0, l = targetQueue.length; i < l; i++) {
                if (targetQueue[i] === method) {
                    targetQueue.splice(i, 1);
                }
            }
        }
    }
    for (i = 0, l = queue.length; i < l; i += 4) {
        currentTarget = queue[i];
        currentMethod = queue[i + 1];
        if (currentTarget === target &&
            currentMethod === method) {
            queue.splice(i, 4);
            return true;
        }
    }
    // if not found in current queue
    // could be in the queue that is being flushed
    queue = this._queueBeingFlushed;
    if (!queue) {
        return;
    }
    for (i = 0, l = queue.length; i < l; i += 4) {
        currentTarget = queue[i];
        currentMethod = queue[i + 1];
        if (currentTarget === target &&
            currentMethod === method) {
            // don't mess with array during flush
            // just nullify the method
            queue[i + 1] = null;
            return true;
        }
    }
};
Queue.prototype.pushUniqueWithoutGuid = function pushUniqueWithoutGuid (target, method, args, stack) {
    var queue = this._queue;
    for (var i = 0, l = queue.length; i < l; i += 4) {
        var currentTarget = queue[i];
        var currentMethod = queue[i + 1];
        if (currentTarget === target && currentMethod === method) {
            queue[i + 2] = args; // replace args
            queue[i + 3] = stack; // replace stack
            return;
        }
    }
    queue.push(target, method, args, stack);
};
Queue.prototype.targetQueue = function targetQueue (targetQueue$1, target, method, args, stack) {
    var queue = this._queue;
    for (var i = 0, l = targetQueue$1.length; i < l; i += 2) {
        var currentMethod = targetQueue$1[i];
        var currentIndex = targetQueue$1[i + 1];
        if (currentMethod === method) {
            queue[currentIndex + 2] = args; // replace args
            queue[currentIndex + 3] = stack; // replace stack
            return;
        }
    }
    targetQueue$1.push(method, queue.push(target, method, args, stack) - 4);
};
Queue.prototype.pushUniqueWithGuid = function pushUniqueWithGuid (guid, target, method, args, stack) {
    var hasLocalQueue = this.targetQueues[guid];
    if (hasLocalQueue) {
        this.targetQueue(hasLocalQueue, target, method, args, stack);
    }
    else {
        this.targetQueues[guid] = [
            method,
            this._queue.push(target, method, args, stack) - 4
        ];
    }
    return {
        queue: this,
        target: target,
        method: method
    };
};
Queue.prototype.invoke = function invoke (target, method, args /*, onError, errorRecordedForStack */) {
    if (args && args.length > 0) {
        method.apply(target, args);
    }
    else {
        method.call(target);
    }
};
Queue.prototype.invokeWithOnError = function invokeWithOnError (target, method, args, onError, errorRecordedForStack) {
    try {
        if (args && args.length > 0) {
            method.apply(target, args);
        }
        else {
            method.call(target);
        }
    }
    catch (error) {
        onError(error, errorRecordedForStack);
    }
};

var DeferredActionQueues = function DeferredActionQueues(queueNames, options) {
    var queues = this.queues = {};
    this.queueNames = queueNames = queueNames || [];
    this.options = options;
    each(queueNames, function (queueName) {
        queues[queueName] = new Queue(queueName, options[queueName], options);
    });
};
DeferredActionQueues.prototype.schedule = function schedule (name, target, method, args, onceFlag, stack) {
    var queues = this.queues;
    var queue = queues[name];
    if (!queue) {
        noSuchQueue(name);
    }
    if (!method) {
        noSuchMethod(name);
    }
    if (onceFlag) {
        return queue.pushUnique(target, method, args, stack);
    }
    else {
        return queue.push(target, method, args, stack);
    }
};
DeferredActionQueues.prototype.flush = function flush () {
        var this$1 = this;

    var queue;
    var queueName;
    var queueNameIndex = 0;
    var numberOfQueues = this.queueNames.length;
    while (queueNameIndex < numberOfQueues) {
        queueName = this$1.queueNames[queueNameIndex];
        queue = this$1.queues[queueName];
        if (queue._queue.length === 0) {
            queueNameIndex++;
        }
        else {
            queue.flush(false /* async */);
            queueNameIndex = 0;
        }
    }
};

var Backburner = function Backburner(queueNames, options) {
      var this$1 = this;

      this.DEBUG = false;
      this._autorun = null;
      this.queueNames = queueNames;
      this.options = options || {};
      if (!this.options.defaultQueue) {
          this.options.defaultQueue = queueNames[0];
      }
      this.currentInstance = null;
      this.instanceStack = [];
      this._debouncees = [];
      this._throttlers = [];
      this._eventCallbacks = {
          end: [],
          begin: []
      };
      this._boundClearItems = function (item) {
          this$1._platform.clearTimeout(item[2]);
      };
      this._timerTimeoutId = undefined;
      this._timers = [];
      this._platform = this.options._platform || {
          setTimeout: function setTimeout$1(fn, ms) {
              return setTimeout(fn, ms);
          },
          clearTimeout: function clearTimeout$1(id) {
              clearTimeout(id);
          }
      };
      this._boundRunExpiredTimers = function () {
          this$1._runExpiredTimers();
      };
      this._boundAutorunEnd = function () {
          this$1._autorun = null;
          this$1.end();
      };
  };
  Backburner.prototype.begin = function begin () {
      var options = this.options;
      var onBegin = options && options.onBegin;
      var previousInstance = this.currentInstance;
      var current;
      if (this._autorun) {
          current = previousInstance;
          this._cancelAutorun();
      }
      else {
          if (previousInstance) {
              this.instanceStack.push(previousInstance);
          }
          current = this.currentInstance = new DeferredActionQueues(this.queueNames, options);
          this._trigger('begin', current, previousInstance);
      }
      if (onBegin) {
          onBegin(current, previousInstance);
      }
      return current;
  };
  Backburner.prototype.end = function end () {
      var options = this.options;
      var onEnd = options && options.onEnd;
      var currentInstance = this.currentInstance;
      var nextInstance = null;
      if (!currentInstance) {
          throw new Error("end called without begin");
      }
      // Prevent double-finally bug in Safari 6.0.2 and iOS 6
      // This bug appears to be resolved in Safari 6.0.5 and iOS 7
      var finallyAlreadyCalled = false;
      try {
          currentInstance.flush();
      }
      finally {
          if (!finallyAlreadyCalled) {
              finallyAlreadyCalled = true;
              this.currentInstance = null;
              if (this.instanceStack.length) {
                  nextInstance = this.instanceStack.pop();
                  this.currentInstance = nextInstance;
              }
              this._trigger('end', currentInstance, nextInstance);
              if (onEnd) {
                  onEnd(currentInstance, nextInstance);
              }
          }
      }
  };
  Backburner.prototype.on = function on (eventName, callback) {
      if (typeof callback !== 'function') {
          throw new TypeError("Callback must be a function");
      }
      var callbacks = this._eventCallbacks[eventName];
      if (callbacks) {
          callbacks.push(callback);
      }
      else {
          throw new TypeError(("Cannot on() event " + eventName + " because it does not exist"));
      }
  };
  Backburner.prototype.off = function off (eventName, callback) {
      if (eventName) {
          var callbacks = this._eventCallbacks[eventName];
          var callbackFound = false;
          if (!callbacks) {
              return;
          }
          if (callback) {
              for (var i = 0; i < callbacks.length; i++) {
                  if (callbacks[i] === callback) {
                      callbackFound = true;
                      callbacks.splice(i, 1);
                      i--;
                  }
              }
          }
          if (!callbackFound) {
              throw new TypeError("Cannot off() callback that does not exist");
          }
      }
      else {
          throw new TypeError(("Cannot off() event " + eventName + " because it does not exist"));
      }
  };
  Backburner.prototype.run = function run (target, method) {
        var args = [], len = arguments.length - 2;
        while ( len-- > 0 ) args[ len ] = arguments[ len + 2 ];

      var length = arguments.length;
      var _method;
      var _target;
      if (length === 1) {
          _method = target;
          _target = null;
      }
      else {
          _target = target;
          _method = method;
      }
      if (isString(_method)) {
          _method = _target[_method];
      }
      var onError = getOnError(this.options);
      this.begin();
      if (onError) {
          try {
              return _method.apply(_target, args);
          }
          catch (error) {
              onError(error);
          }
          finally {
              this.end();
          }
      }
      else {
          try {
              return _method.apply(_target, args);
          }
          finally {
              this.end();
          }
      }
  };
  Backburner.prototype.join = function join () {
        var arguments$1 = arguments;

      if (!this.currentInstance) {
          return this.run.apply(this, arguments);
      }
      var length = arguments.length;
      var method;
      var target;
      if (length === 1) {
          method = arguments[0];
          target = null;
      }
      else {
          target = arguments[0];
          method = arguments[1];
      }
      if (isString(method)) {
          method = target[method];
      }
      if (length === 1) {
          return method();
      }
      else if (length === 2) {
          return method.call(target);
      }
      else {
          var args = new Array(length - 2);
          for (var i = 0, l = length - 2; i < l; i++) {
              args[i] = arguments$1[i + 2];
          }
          return method.apply(target, args);
      }
  };
  Backburner.prototype.defer = function defer () {
      return this.schedule.apply(this, arguments);
  };
  Backburner.prototype.schedule = function schedule (queueName) {
        var arguments$1 = arguments;

      var length = arguments.length;
      var method;
      var target;
      var args;
      if (length === 2) {
          method = arguments[1];
          target = null;
      }
      else {
          target = arguments[1];
          method = arguments[2];
      }
      if (isString(method)) {
          method = target[method];
      }
      var stack = this.DEBUG ? new Error() : undefined;
      if (length > 3) {
          args = new Array(length - 3);
          for (var i = 3; i < length; i++) {
              args[i - 3] = arguments$1[i];
          }
      }
      else {
          args = undefined;
      }
      return this._ensureInstance().schedule(queueName, target, method, args, false, stack);
  };
  Backburner.prototype.deferOnce = function deferOnce () {
      return this.scheduleOnce.apply(this, arguments);
  };
  Backburner.prototype.scheduleOnce = function scheduleOnce (queueName /* , target, method, args */) {
        var arguments$1 = arguments;

      var length = arguments.length;
      var method;
      var target;
      var args;
      if (length === 2) {
          method = arguments[1];
          target = null;
      }
      else {
          target = arguments[1];
          method = arguments[2];
      }
      if (isString(method)) {
          method = target[method];
      }
      var stack = this.DEBUG ? new Error() : undefined;
      if (length > 3) {
          args = new Array(length - 3);
          for (var i = 3; i < length; i++) {
              args[i - 3] = arguments$1[i];
          }
      }
      else {
          args = undefined;
      }
      var currentInstance = this._ensureInstance();
      return currentInstance.schedule(queueName, target, method, args, true, stack);
  };
  Backburner.prototype.setTimeout = function setTimeout () {
      return this.later.apply(this, arguments);
  };
  Backburner.prototype.later = function later () {
        var arguments$1 = arguments;

      var l = arguments.length;
      var args = new Array(l);
      for (var x = 0; x < l; x++) {
          args[x] = arguments$1[x];
      }
      var length = args.length;
      var method;
      var wait;
      var target;
      var methodOrTarget;
      var methodOrWait;
      var methodOrArgs;
      if (length === 0) {
          return;
      }
      else if (length === 1) {
          method = args.shift();
          wait = 0;
      }
      else if (length === 2) {
          methodOrTarget = args[0];
          methodOrWait = args[1];
          if (isFunction(methodOrWait) || isFunction(methodOrTarget[methodOrWait])) {
              target = args.shift();
              method = args.shift();
              wait = 0;
          }
          else if (isCoercableNumber(methodOrWait)) {
              method = args.shift();
              wait = args.shift();
          }
          else {
              method = args.shift();
              wait = 0;
          }
      }
      else {
          var last = args[args.length - 1];
          if (isCoercableNumber(last)) {
              wait = args.pop();
          }
          else {
              wait = 0;
          }
          methodOrTarget = args[0];
          methodOrArgs = args[1];
          if (isFunction(methodOrArgs) || (isString(methodOrArgs) &&
              methodOrTarget !== null &&
              methodOrArgs in methodOrTarget)) {
              target = args.shift();
              method = args.shift();
          }
          else {
              method = args.shift();
          }
      }
      var executeAt = now() + parseInt(wait !== wait ? 0 : wait, 10);
      if (isString(method)) {
          method = target[method];
      }
      var onError = getOnError(this.options);
      function fn() {
          if (onError) {
              try {
                  method.apply(target, args);
              }
              catch (e) {
                  onError(e);
              }
          }
          else {
              method.apply(target, args);
          }
      }
      return this._setTimeout(fn, executeAt);
  };
  Backburner.prototype.throttle = function throttle (target, method /* , args, wait, [immediate] */) {
        var arguments$1 = arguments;

      var backburner = this;
      var args = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
          args[i] = arguments$1[i];
      }
      var immediate = args.pop();
      var wait;
      var throttler;
      var index;
      var timer;
      if (isNumber(immediate) || isString(immediate)) {
          wait = immediate;
          immediate = true;
      }
      else {
          wait = args.pop();
      }
      wait = parseInt(wait, 10);
      index = findThrottler(target, method, this._throttlers);
      if (index > -1) {
          return this._throttlers[index];
      } // throttled
      timer = this._platform.setTimeout(function () {
          if (!immediate) {
              backburner.run.apply(backburner, args);
          }
          index = findThrottler(target, method, backburner._throttlers);
          if (index > -1) {
              backburner._throttlers.splice(index, 1);
          }
      }, wait);
      if (immediate) {
          this.join.apply(this, args);
      }
      throttler = [target, method, timer];
      this._throttlers.push(throttler);
      return throttler;
  };
  Backburner.prototype.debounce = function debounce (target, method /* , args, wait, [immediate] */) {
        var arguments$1 = arguments;

      var backburner = this;
      var args = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
          args[i] = arguments$1[i];
      }
      var immediate = args.pop();
      var wait;
      var index;
      var debouncee;
      var timer;
      if (isNumber(immediate) || isString(immediate)) {
          wait = immediate;
          immediate = false;
      }
      else {
          wait = args.pop();
      }
      wait = parseInt(wait, 10);
      // Remove debouncee
      index = findDebouncee(target, method, this._debouncees);
      if (index > -1) {
          debouncee = this._debouncees[index];
          this._debouncees.splice(index, 1);
          this._platform.clearTimeout(debouncee[2]);
      }
      timer = this._platform.setTimeout(function () {
          if (!immediate) {
              backburner.run.apply(backburner, args);
          }
          index = findDebouncee(target, method, backburner._debouncees);
          if (index > -1) {
              backburner._debouncees.splice(index, 1);
          }
      }, wait);
      if (immediate && index === -1) {
          backburner.run.apply(backburner, args);
      }
      debouncee = [
          target,
          method,
          timer
      ];
      backburner._debouncees.push(debouncee);
      return debouncee;
  };
  Backburner.prototype.cancelTimers = function cancelTimers () {
      each(this._throttlers, this._boundClearItems);
      this._throttlers = [];
      each(this._debouncees, this._boundClearItems);
      this._debouncees = [];
      this._clearTimerTimeout();
      this._timers = [];
      this._cancelAutorun();
  };
  Backburner.prototype.hasTimers = function hasTimers () {
      return !!this._timers.length || !!this._debouncees.length || !!this._throttlers.length || this._autorun;
  };
  Backburner.prototype.cancel = function cancel (timer) {
        var this$1 = this;

      var timerType = typeof timer;
      if (timer && timerType === 'object' && timer.queue && timer.method) {
          return timer.queue.cancel(timer);
      }
      else if (timerType === 'function') {
          for (var i = 0, l = this._timers.length; i < l; i += 2) {
              if (this$1._timers[i + 1] === timer) {
                  this$1._timers.splice(i, 2); // remove the two elements
                  if (i === 0) {
                      this$1._reinstallTimerTimeout();
                  }
                  return true;
              }
          }
      }
      else if (Object.prototype.toString.call(timer) === '[object Array]') {
          return this._cancelItem(findThrottler, this._throttlers, timer) ||
              this._cancelItem(findDebouncee, this._debouncees, timer);
      }
      else {
          return; // timer was null or not a timer
      }
  };
  Backburner.prototype._cancelAutorun = function _cancelAutorun () {
      if (this._autorun) {
          this._platform.clearTimeout(this._autorun);
          this._autorun = null;
      }
  };
  Backburner.prototype._setTimeout = function _setTimeout (fn, executeAt) {
      if (this._timers.length === 0) {
          this._timers.push(executeAt, fn);
          this._installTimerTimeout();
          return fn;
      }
      // find position to insert
      var i = binarySearch(executeAt, this._timers);
      this._timers.splice(i, 0, executeAt, fn);
      // we should be the new earliest timer if i == 0
      if (i === 0) {
          this._reinstallTimerTimeout();
      }
      return fn;
  };
  Backburner.prototype._cancelItem = function _cancelItem (findMethod, array, timer) {
      var item;
      var index;
      if (timer.length < 3) {
          return false;
      }
      index = findMethod(timer[0], timer[1], array);
      if (index > -1) {
          item = array[index];
          if (item[2] === timer[2]) {
              array.splice(index, 1);
              this._platform.clearTimeout(timer[2]);
              return true;
          }
      }
      return false;
  };
  /**
   Trigger an event. Supports up to two arguments. Designed around
   triggering transition events from one run loop instance to the
   next, which requires an argument for the first instance and then
   an argument for the next instance.
  
   @private
   @method _trigger
   @param {String} eventName
   @param {any} arg1
   @param {any} arg2
   */
  Backburner.prototype._trigger = function _trigger (eventName, arg1, arg2) {
      var callbacks = this._eventCallbacks[eventName];
      if (callbacks) {
          for (var i = 0; i < callbacks.length; i++) {
              callbacks[i](arg1, arg2);
          }
      }
  };
  Backburner.prototype._runExpiredTimers = function _runExpiredTimers () {
      this._timerTimeoutId = undefined;
      this.run(this, this._scheduleExpiredTimers);
  };
  Backburner.prototype._scheduleExpiredTimers = function _scheduleExpiredTimers () {
        var this$1 = this;

      var n = now();
      var timers = this._timers;
      var i = 0;
      var l = timers.length;
      for (; i < l; i += 2) {
          var executeAt = timers[i];
          var fn = timers[i + 1];
          if (executeAt <= n) {
              this$1.defer(this$1.options.defaultQueue, null, fn);
          }
          else {
              break;
          }
      }
      timers.splice(0, i);
      this._installTimerTimeout();
  };
  Backburner.prototype._reinstallTimerTimeout = function _reinstallTimerTimeout () {
      this._clearTimerTimeout();
      this._installTimerTimeout();
  };
  Backburner.prototype._clearTimerTimeout = function _clearTimerTimeout () {
      if (!this._timerTimeoutId) {
          return;
      }
      this._platform.clearTimeout(this._timerTimeoutId);
      this._timerTimeoutId = undefined;
  };
  Backburner.prototype._installTimerTimeout = function _installTimerTimeout () {
      if (!this._timers.length) {
          return;
      }
      var minExpiresAt = this._timers[0];
      var n = now();
      var wait = Math.max(0, minExpiresAt - n);
      this._timerTimeoutId = this._platform.setTimeout(this._boundRunExpiredTimers, wait);
  };
  Backburner.prototype._ensureInstance = function _ensureInstance () {
      var currentInstance = this.currentInstance;
      if (!currentInstance) {
          var setTimeout = this._platform.setTimeout;
          currentInstance = this.begin();
          this._autorun = setTimeout(this._boundAutorunEnd, 0);
      }
      return currentInstance;
  };

Backburner.Queue = Queue;

exports['default'] = Backburner;

Object.defineProperty(exports, '__esModule', { value: true });

});

//# sourceMappingURL=backburner.js.map
