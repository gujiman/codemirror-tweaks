// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"), require("../../mode/css/css"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror", "../../mode/css/css"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  var pseudoClasses = {link: 1, visited: 1, active: 1, hover: 1, focus: 1,
                       "first-letter": 1, "first-line": 1, "first-child": 1,
                       before: 1, after: 1, lang: 1};

  CodeMirror.registerHelper("hint", "css", function(cm) {
    var cur = cm.getCursor(), token = cm.getTokenAt(cur);
    var inner = CodeMirror.innerMode(cm.getMode(), token.state);
    if (inner.mode.name != "css") return;

    if (token.type == "keyword" && "!important".indexOf(token.string) == 0)
      return {list: ["!important"], from: CodeMirror.Pos(cur.line, token.start),
              to: CodeMirror.Pos(cur.line, token.end)};

    var start = token.start, end = cur.ch, word = token.string.slice(0, end - start);

    if (/[^\w$_-]/.test(word)) {
      word = ""; start = end = cur.ch;
    }

    var spec = CodeMirror.resolveMode("text/css");

    var result = [];
    function add(keywords) {
      for (var name in keywords)
        if (!word || name.lastIndexOf(word, 0) == 0)
          result.push(name);
    }
    function getPropertyName(){
      var getFullLine = cm.doc.getLine(cm.doc.getCursor().line);
      var getPartLine = getFullLine.substring(0, cur.ch);
      var getSeparator = getPartLine.lastIndexOf(":");
      getPartLine = getPartLine.substring(0, getSeparator);
      getPartLine = getPartLine.replace(/{/g, '{ ').replace(/;/g, '; ').replace(/\s\s+/g, ' ');
      getPartLine = " " + getPartLine.replace(/^\s+|\s+$/gm,'');
      return getPartLine.split(" ").splice(-1)[0];
   }
   function myKeySet(array) {
     var keys = {};
     for (var i = 0; i < array.length; ++i) {
       var val = array[i];
       if (val.indexOf("<") == -1){
         keys[val] = true;
       }else{
         var commonCssVals = spec.commonCssValues[val].split(",");
         for (var x = 0; x < commonCssVals.length; ++x) {
            keys[commonCssVals[x]] = true;
         }
       }
     }
     return keys;
   }

    var st = inner.state.state;

    if (st == "pseudo" || token.type == "variable-3") {
      add(pseudoClasses);
    } else if (st == "block" || st == "maybeprop") {
      add(spec.propertyKeywords);
    } else if (st == "parens" || st == "at" || st == "params") {
      add(spec.valueKeywords);
      add(spec.colorKeywords);
    } else if (st == "prop") {
       
      var getProp = getPropertyName();
      var getPropValues = spec.cssProperties[getProp];
      
      if (typeof getPropValues !== "undefined"){
         var keywords = {};
         if (getPropValues != ""){
            keywords = myKeySet(getPropValues.split(","));
         }
         keywords["inherit"] = true;
         keywords["initial"] = true;
         add(keywords);
         
      }else{
         add(spec.valueKeywords);
         add(spec.colorKeywords);
      }
    } else if (st == "media" || st == "media_parens") {
      add(spec.mediaTypes);
      add(spec.mediaFeatures);
    }

    if (result.length) return {
      list: result,
      from: CodeMirror.Pos(cur.line, start),
      to: CodeMirror.Pos(cur.line, end)
    };
  });
});
