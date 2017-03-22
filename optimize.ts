const parse = require('acorn').parse;
const walk = require('estree-walker').walk;
const binsearch = require('array-binsearch').default;

export default function optimize(code: string) {
  var ast = parse(code);
  var optimizer = new Optimizer(code, ast, {backburner: true});
  walk(ast, {
    enter: function (node, parent) {
      optimizer.enter(node, parent);
    },
    leave: function (node, parent) {
      optimizer.leave(node, parent);
    }
  });
  return optimizer.code();
}

function Optimizer(code, ast, eager) {
  this.ast = ast;
  this.eager = eager;
  this.stack = [];
  this.splits = [0];
  this.insertions = [""];
  this.chunks = [code];
}

Optimizer.prototype.insert = function(pos, insertion) {
  var splits = this.splits;
  var chunks = this.chunks;
  var insertions = this.insertions;
  var i = binsearch(splits, pos);
  if (i < 0) {
    i = ~i;
    var before = splits[i - 1];
    var chunk = chunks[i - 1];
    chunks[i - 1] = chunk.slice(0, pos - before);
    chunks.splice(i, 0, chunk.slice(pos - before));
    splits.splice(i, 0, pos);
    insertions.splice(i, 0, insertion);
  }
  else {
    throw new Error("shouldn't happen");
  }
};

Optimizer.prototype.wrap = function(expression) {
  this.insert(expression.start, "(");
  this.insert(expression.end, ")");
};

Optimizer.prototype.parent = function() {
  var stack = this.stack;
  return stack[stack.length - 1];
};

Optimizer.prototype.enter = function(node, parent) {
  if (parent) {
    this.stack.push(parent);
  }
  if (node.type === "FunctionExpression") {
    if (parent.type === "CallExpression") {
      var callee = parent.callee;
      if (callee === node) {
        this.wrap(node);
      }
      else if (parent.arguments.indexOf(node) !== -1) {
        if (callee.type === "Identifier" &&
          callee.name === "define") {
          // TOP LEVEL DEFINE Program > ExpressionStatement > CallExpression
          if (this.stack.length === 3 && parent.arguments.length === 3) {
            var moduleName = parent.arguments[0];
            if (moduleName.type === "Literal" && typeof moduleName.value === "string") {
              var name = moduleName.value;
              if (this.eager && this.eager[name]) {
                this.wrap(node);
              }
            }
            else {
              throw new Error("unreachable");
            }
          }
          else {
            this.wrap(node);
          }
        }
        else {
          this.wrap(node);
        }
      }
      else {
        throw new Error("unreachable");
      }
    }
  }
}

Optimizer.prototype.leave = function(node, parent) {
  if (parent) {
    this.stack.pop();
  }
};

Optimizer.prototype.code = function() {
  var buf = "";
  var chunks = this.chunks;
  var insertions = this.insertions;
  for (var i = 0; i < chunks.length; i++) {
    buf += insertions[i];
    buf += chunks[i];
  }
  return buf;
};