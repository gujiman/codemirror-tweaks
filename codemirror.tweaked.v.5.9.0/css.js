// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
"use strict";

CodeMirror.defineMode("css", function(config, parserConfig) {
  var provided = parserConfig;
  if (!parserConfig.propertyKeywords) parserConfig = CodeMirror.resolveMode("text/css");
  parserConfig.inline = provided.inline;

  var indentUnit = config.indentUnit,
      tokenHooks = parserConfig.tokenHooks,
      documentTypes = parserConfig.documentTypes || {},
      mediaTypes = parserConfig.mediaTypes || {},
      mediaFeatures = parserConfig.mediaFeatures || {},
      mediaValueKeywords = parserConfig.mediaValueKeywords || {},
      propertyKeywords = parserConfig.propertyKeywords || {},
      nonStandardPropertyKeywords = parserConfig.nonStandardPropertyKeywords || {},
      fontProperties = parserConfig.fontProperties || {},
      counterDescriptors = parserConfig.counterDescriptors || {},
      colorKeywords = parserConfig.colorKeywords || {},
      valueKeywords = parserConfig.valueKeywords || {},
      cssProperties = parserConfig.cssProperties || {},
      commonCssValues = parserConfig.commonCssValues || {},
      allowNested = parserConfig.allowNested,
      supportsAtComponent = parserConfig.supportsAtComponent === true;

  var type, override;
  function ret(style, tp) { type = tp; return style; }

  // Tokenizers

  function tokenBase(stream, state) {
    var ch = stream.next();
    if (tokenHooks[ch]) {
      var result = tokenHooks[ch](stream, state);
      if (result !== false) return result;
    }
    if (ch == "@") {
      stream.eatWhile(/[\w\\\-]/);
      return ret("def", stream.current());
    } else if (ch == "=" || (ch == "~" || ch == "|") && stream.eat("=")) {
      return ret(null, "compare");
    } else if (ch == "\"" || ch == "'") {
      state.tokenize = tokenString(ch);
      return state.tokenize(stream, state);
    } else if (ch == "#") {
      stream.eatWhile(/[\w\\\-]/);
      return ret("atom", "hash");
    } else if (ch == "!") {
      stream.match(/^\s*\w*/);
      return ret("keyword", "important");
    } else if (/\d/.test(ch) || ch == "." && stream.eat(/\d/)) {
      stream.eatWhile(/[\w.%]/);
      return ret("number", "unit");
    } else if (ch === "-") {
      if (/[\d.]/.test(stream.peek())) {
        stream.eatWhile(/[\w.%]/);
        return ret("number", "unit");
      } else if (stream.match(/^-[\w\\\-]+/)) {
        stream.eatWhile(/[\w\\\-]/);
        if (stream.match(/^\s*:/, false))
          return ret("variable-2", "variable-definition");
        return ret("variable-2", "variable");
      } else if (stream.match(/^\w+-/)) {
        return ret("meta", "meta");
      }
    } else if (/[,+>*\/]/.test(ch)) {
      return ret(null, "select-op");
    } else if (ch == "." && stream.match(/^-?[_a-z][_a-z0-9-]*/i)) {
      return ret("qualifier", "qualifier");
    } else if (/[:;{}\[\]\(\)]/.test(ch)) {
      return ret(null, ch);
    } else if ((ch == "u" && stream.match(/rl(-prefix)?\(/)) ||
               (ch == "d" && stream.match("omain(")) ||
               (ch == "r" && stream.match("egexp("))) {
      stream.backUp(1);
      state.tokenize = tokenParenthesized;
      return ret("property", "word");
    } else if (/[\w\\\-]/.test(ch)) {
      stream.eatWhile(/[\w\\\-]/);
      return ret("property", "word");
    } else {
      return ret(null, null);
    }
  }

  function tokenString(quote) {
    return function(stream, state) {
      var escaped = false, ch;
      while ((ch = stream.next()) != null) {
        if (ch == quote && !escaped) {
          if (quote == ")") stream.backUp(1);
          break;
        }
        escaped = !escaped && ch == "\\";
      }
      if (ch == quote || !escaped && quote != ")") state.tokenize = null;
      return ret("string", "string");
    };
  }

  function tokenParenthesized(stream, state) {
    stream.next(); // Must be '('
    if (!stream.match(/\s*[\"\')]/, false))
      state.tokenize = tokenString(")");
    else
      state.tokenize = null;
    return ret(null, "(");
  }

  // Context management

  function Context(type, indent, prev) {
    this.type = type;
    this.indent = indent;
    this.prev = prev;
  }

  function pushContext(state, stream, type, indent) {
    state.context = new Context(type, stream.indentation() + (indent === false ? 0 : indentUnit), state.context);
    return type;
  }

  function popContext(state) {
    if (state.context.prev)
      state.context = state.context.prev;
    return state.context.type;
  }

  function pass(type, stream, state) {
    return states[state.context.type](type, stream, state);
  }
  function popAndPass(type, stream, state, n) {
    for (var i = n || 1; i > 0; i--)
      state.context = state.context.prev;
    return pass(type, stream, state);
  }

  // Parser

  function wordAsValue(stream) {
    var word = stream.current().toLowerCase();
    if (valueKeywords.hasOwnProperty(word))
      override = "atom";
    else if (colorKeywords.hasOwnProperty(word))
      override = "keyword";
    else
      override = "variable";
  }

  var states = {};

  states.top = function(type, stream, state) {
    if (type == "{") {
      return pushContext(state, stream, "block");
    } else if (type == "}" && state.context.prev) {
      return popContext(state);
    } else if (supportsAtComponent && /@component/.test(type)) {
      return pushContext(state, stream, "atComponentBlock");
    } else if (/^@(-moz-)?document$/.test(type)) {
      return pushContext(state, stream, "documentTypes");
    } else if (/^@(media|supports|(-moz-)?document|import)$/.test(type)) {
      return pushContext(state, stream, "atBlock");
    } else if (/^@(font-face|counter-style)/.test(type)) {
      state.stateArg = type;
      return "restricted_atBlock_before";
    } else if (/^@(-(moz|ms|o|webkit)-)?keyframes$/.test(type)) {
      return "keyframes";
    } else if (type && type.charAt(0) == "@") {
      return pushContext(state, stream, "at");
    } else if (type == "hash") {
      override = "builtin";
    } else if (type == "word") {
      override = "tag";
    } else if (type == "variable-definition") {
      return "maybeprop";
    } else if (type == "interpolation") {
      return pushContext(state, stream, "interpolation");
    } else if (type == ":") {
      return "pseudo";
    } else if (allowNested && type == "(") {
      return pushContext(state, stream, "parens");
    }
    return state.context.type;
  };

  states.block = function(type, stream, state) {
    if (type == "word") {
      var word = stream.current().toLowerCase();
      if (propertyKeywords.hasOwnProperty(word)) {
        override = "property";
        return "maybeprop";
      } else if (nonStandardPropertyKeywords.hasOwnProperty(word)) {
        override = "string-2";
        return "maybeprop";
      } else if (allowNested) {
        override = stream.match(/^\s*:(?:\s|$)/, false) ? "property" : "tag";
        return "block";
      } else {
        override += " error";
        return "maybeprop";
      }
    } else if (type == "meta") {
      return "block";
    } else if (!allowNested && (type == "hash" || type == "qualifier")) {
      override = "error";
      return "block";
    } else {
      return states.top(type, stream, state);
    }
  };

  states.maybeprop = function(type, stream, state) {
    if (type == ":") return pushContext(state, stream, "prop");
    return pass(type, stream, state);
  };

  states.prop = function(type, stream, state) {
    if (type == ";") return popContext(state);
    if (type == "{" && allowNested) return pushContext(state, stream, "propBlock");
    if (type == "}" || type == "{") return popAndPass(type, stream, state);
    if (type == "(") return pushContext(state, stream, "parens");

    if (type == "hash" && !/^#([0-9a-fA-f]{3,4}|[0-9a-fA-f]{6}|[0-9a-fA-f]{8})$/.test(stream.current())) {
      override += " error";
    } else if (type == "word") {
      wordAsValue(stream);
    } else if (type == "interpolation") {
      return pushContext(state, stream, "interpolation");
    }
    return "prop";
  };

  states.propBlock = function(type, _stream, state) {
    if (type == "}") return popContext(state);
    if (type == "word") { override = "property"; return "maybeprop"; }
    return state.context.type;
  };

  states.parens = function(type, stream, state) {
    if (type == "{" || type == "}") return popAndPass(type, stream, state);
    if (type == ")") return popContext(state);
    if (type == "(") return pushContext(state, stream, "parens");
    if (type == "interpolation") return pushContext(state, stream, "interpolation");
    if (type == "word") wordAsValue(stream);
    return "parens";
  };

  states.pseudo = function(type, stream, state) {
    if (type == "word") {
      override = "variable-3";
      return state.context.type;
    }
    return pass(type, stream, state);
  };

  states.documentTypes = function(type, stream, state) {
    if (type == "word" && documentTypes.hasOwnProperty(stream.current())) {
      override = "tag";
      return state.context.type;
    } else {
      return states.atBlock(type, stream, state);
    }
  };

  states.atBlock = function(type, stream, state) {
    if (type == "(") return pushContext(state, stream, "atBlock_parens");
    if (type == "}" || type == ";") return popAndPass(type, stream, state);
    if (type == "{") return popContext(state) && pushContext(state, stream, allowNested ? "block" : "top");

    if (type == "word") {
      var word = stream.current().toLowerCase();
      if (word == "only" || word == "not" || word == "and" || word == "or")
        override = "keyword";
      else if (mediaTypes.hasOwnProperty(word))
        override = "attribute";
      else if (mediaFeatures.hasOwnProperty(word))
        override = "property";
      else if (mediaValueKeywords.hasOwnProperty(word))
        override = "keyword";
      else if (propertyKeywords.hasOwnProperty(word))
        override = "property";
      else if (nonStandardPropertyKeywords.hasOwnProperty(word))
        override = "string-2";
      else if (valueKeywords.hasOwnProperty(word))
        override = "atom";
      else if (colorKeywords.hasOwnProperty(word))
        override = "keyword";
      else
        override = "error";
    }
    return state.context.type;
  };

  states.atComponentBlock = function(type, stream, state) {
    if (type == "}")
      return popAndPass(type, stream, state);
    if (type == "{")
      return popContext(state) && pushContext(state, stream, allowNested ? "block" : "top", false);
    if (type == "word")
      override = "error";
    return state.context.type;
  };

  states.atBlock_parens = function(type, stream, state) {
    if (type == ")") return popContext(state);
    if (type == "{" || type == "}") return popAndPass(type, stream, state, 2);
    return states.atBlock(type, stream, state);
  };

  states.restricted_atBlock_before = function(type, stream, state) {
    if (type == "{")
      return pushContext(state, stream, "restricted_atBlock");
    if (type == "word" && state.stateArg == "@counter-style") {
      override = "variable";
      return "restricted_atBlock_before";
    }
    return pass(type, stream, state);
  };

  states.restricted_atBlock = function(type, stream, state) {
    if (type == "}") {
      state.stateArg = null;
      return popContext(state);
    }
    if (type == "word") {
      if ((state.stateArg == "@font-face" && !fontProperties.hasOwnProperty(stream.current().toLowerCase())) ||
          (state.stateArg == "@counter-style" && !counterDescriptors.hasOwnProperty(stream.current().toLowerCase())))
        override = "error";
      else
        override = "property";
      return "maybeprop";
    }
    return "restricted_atBlock";
  };

  states.keyframes = function(type, stream, state) {
    if (type == "word") { override = "variable"; return "keyframes"; }
    if (type == "{") return pushContext(state, stream, "top");
    return pass(type, stream, state);
  };

  states.at = function(type, stream, state) {
    if (type == ";") return popContext(state);
    if (type == "{" || type == "}") return popAndPass(type, stream, state);
    if (type == "word") override = "tag";
    else if (type == "hash") override = "builtin";
    return "at";
  };

  states.interpolation = function(type, stream, state) {
    if (type == "}") return popContext(state);
    if (type == "{" || type == ";") return popAndPass(type, stream, state);
    if (type == "word") override = "variable";
    else if (type != "variable" && type != "(" && type != ")") override = "error";
    return "interpolation";
  };

  return {
    startState: function(base) {
      return {tokenize: null,
              state: parserConfig.inline ? "block" : "top",
              stateArg: null,
              context: new Context(parserConfig.inline ? "block" : "top", base || 0, null)};
    },

    token: function(stream, state) {
      if (!state.tokenize && stream.eatSpace()) return null;
      var style = (state.tokenize || tokenBase)(stream, state);
      if (style && typeof style == "object") {
        type = style[1];
        style = style[0];
      }
      override = style;
      state.state = states[state.state](type, stream, state);
      return override;
    },

    indent: function(state, textAfter) {
      var cx = state.context, ch = textAfter && textAfter.charAt(0);
      var indent = cx.indent;
      if (cx.type == "prop" && (ch == "}" || ch == ")")) cx = cx.prev;
      if (cx.prev) {
        if (ch == "}" && (cx.type == "block" || cx.type == "top" ||
                          cx.type == "interpolation" || cx.type == "restricted_atBlock")) {
          // Resume indentation from parent context.
          cx = cx.prev;
          indent = cx.indent;
        } else if (ch == ")" && (cx.type == "parens" || cx.type == "atBlock_parens") ||
            ch == "{" && (cx.type == "at" || cx.type == "atBlock")) {
          // Dedent relative to current context.
          indent = Math.max(0, cx.indent - indentUnit);
          cx = cx.prev;
        }
      }
      return indent;
    },

    electricChars: "}",
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    fold: "brace"
  };
});

  function keySet(array) {
    var keys = {};
    for (var i = 0; i < array.length; ++i) {
      keys[array[i]] = true;
    }
    return keys;
  }

  var documentTypes_ = [
    "domain", "regexp", "url", "url-prefix"
  ], documentTypes = keySet(documentTypes_);

  var mediaTypes_ = [
    "all", "aural", "braille", "handheld", "print", "projection", "screen",
    "tty", "tv", "embossed"
  ], mediaTypes = keySet(mediaTypes_);

  var mediaFeatures_ = [
    "width", "min-width", "max-width", "height", "min-height", "max-height",
    "device-width", "min-device-width", "max-device-width", "device-height",
    "min-device-height", "max-device-height", "aspect-ratio",
    "min-aspect-ratio", "max-aspect-ratio", "device-aspect-ratio",
    "min-device-aspect-ratio", "max-device-aspect-ratio", "color", "min-color",
    "max-color", "color-index", "min-color-index", "max-color-index",
    "monochrome", "min-monochrome", "max-monochrome", "resolution",
    "min-resolution", "max-resolution", "scan", "grid", "orientation",
    "device-pixel-ratio", "min-device-pixel-ratio", "max-device-pixel-ratio",
    "pointer", "any-pointer", "hover", "any-hover"
  ], mediaFeatures = keySet(mediaFeatures_);

  var mediaValueKeywords_ = [
    "landscape", "portrait", "none", "coarse", "fine", "on-demand", "hover",
    "interlace", "progressive"
  ], mediaValueKeywords = keySet(mediaValueKeywords_);

var cssProperties = {
    "align-items": "flex-start,flex-end,center,baseline,stretch",
    "align-content": "flex-start,flex-end,center,space-between,space-around,stretch",
    "align-self": "auto,flex-start,flex-end,center,baseline,stretch",
    "alignment-adjust": "auto,baseline,before-edge,text-before-edge,middle,central,after-edge,text-after-edge,ideographic,alphabetic,hanging,mathematical",
    "alignment-baseline": "baseline,use-script,before-edge,text-before-edge,after-edge,text-after-edge,central,middle,ideographic,alphabetic,hanging,mathematical",
    "animation": "",
    "animation-delay": "",
    "animation-direction": "normal,alternate",
    "animation-duration": "",
    "animation-fill-mode": "none,forwards,backwards,both",
    "animation-iteration-count": "infinite",
    "animation-name": "none",
    "animation-play-state": "running,paused",
    "animation-timing-function": "",
    "appearance": "icon,window,desktop,workspace,document,tooltip,dialog,button,push-button,hyperlink,radio-button,checkbox,menu-item,tab,menu,menubar,pull-down-menu,pop-up-menu,list-menu,radio-group,checkbox-group,outline-tree,range,field,combo-box,signature,password,normal,none",
    "azimuth": "",
    "backface-visibility": "visible,hidden",
    "background": "",
    "background-attachment": "scroll,fixed,local",
    "background-clip": "<box>",
    "background-color": "<color>",
    "background-image": "none",
    "background-origin": "<box>",
    "background-position": "<bg-position>",
    "background-repeat": "repeat,space,round,no-repeat,repeat-x,repeat-y",
    "background-size": "auto,cover,contain",
    "baseline-shift": "baseline,sub,super",
    "behavior": "",
    "binding": "",
    "bleed": "",
    "bookmark-label": "",
    "bookmark-level": "none",
    "bookmark-state": "open,closed",
    "bookmark-target": "none",
    "border": "",
    "border-bottom": "",
    "border-bottom-color": "<color>",
    "border-bottom-left-radius": "",
    "border-bottom-right-radius": "",
    "border-bottom-style": "<border-style>",
    "border-bottom-width": "<border-width>",
    "border-collapse": "collapse,separate",
    "border-color": "<color>",
    "border-image": "",
    "border-image-outset": "",
    "border-image-repeat": "stretch,repeat,round",
    "border-image-slice": "",
    "border-image-source": "none",
    "border-image-width": "auto",
    "border-left": "",
    "border-left-color": "<color>",
    "border-left-style": "<border-style>",
    "border-left-width": "<border-width>",
    "border-radius": "",
    "border-right": "",
    "border-right-color": "<color>",
    "border-right-style": "<border-style>",
    "border-right-width": "<border-width>",
    "border-spacing": "",
    "border-style": "<border-style>",
    "border-top": "",
    "border-top-color": "<color>",
    "border-top-left-radius": "",
    "border-top-right-radius": "",
    "border-top-style": "<border-style>",
    "border-top-width": "<border-width>",
    "border-width": "<border-width>",
    "bottom": "<margin-width>",
    "box-decoration-break": "slice,clone",
    "box-shadow": "",
    "box-sizing": "content-box,border-box",
    "break-after": "auto,always,avoid,left,right,page,column,avoid-page,avoid-column",
    "break-before": "auto,always,avoid,left,right,page,column,avoid-page,avoid-column",
    "break-inside": "auto,avoid,avoid-page,avoid-column",
    "caption-side": "top,bottom",
    "clear": "none,right,left,both",
    "clip": "",
    "clip-path": "",
    "clip-rule": "",
    "color": "<color>",
    "color-interpolation": "",
    "color-interpolation-filters": "",
    "color-profile": "",
    "color-rendering": "",
    "column-count": "auto",
    "column-fill": "auto,balance",
    "column-gap": "normal",
    "column-rule": "",
    "column-rule-color": "<color>",
    "column-rule-style": "<border-style>",
    "column-rule-width": "<border-width>",
    "column-span": "none,all",
    "column-width": "auto",
    "columns": "",
    "content": "",
    "counter-increment": "",
    "counter-reset": "",
    "crop": "auto",
    "cue": "cue-after,cue-before",
    "cue-after": "",
    "cue-before": "",
    "cursor": "auto,default,none,context-menu,help,pointer,progress,wait,cell,crosshair,text,vertical-text,alias,copy,move,no-drop,not-allowed,e-resize,n-resize,ne-resize,nw-resize,s-resize,se-resize,sw-resize,w-resize,ew-resize,ns-resize,nesw-resize,nwse-resize,col-resize,row-resize,all-scroll,zoom-in,zoom-out,grab,grabbing",
    "direction": "ltr,rtl",
    "display": "inline,block,list-item,inline-block,table,inline-table,table-row-group,table-header-group,table-footer-group,table-row,table-column-group,table-column,table-cell,table-caption,grid,inline-grid,run-in,ruby,ruby-base,ruby-text,ruby-base-container,ruby-text-container,contents,none,-moz-box,-moz-inline-block,-moz-inline-box,-moz-inline-grid,-moz-inline-stack,-moz-inline-table,-moz-grid,-moz-grid-group,-moz-grid-line,-moz-groupbox,-moz-deck,-moz-popup,-moz-stack,-moz-marker,-webkit-box,-webkit-inline-box,-ms-flexbox,-ms-inline-flexbox,flex,-webkit-flex,inline-flex,-webkit-inline-flex",
    "dominant-baseline": "",
    "drop-initial-after-adjust": "central,middle,after-edge,text-after-edge,ideographic,alphabetic,mathematical",
    "drop-initial-after-align": "baseline,use-script,before-edge,text-before-edge,after-edge,text-after-edge,central,middle,ideographic,alphabetic,hanging,mathematical",
    "drop-initial-before-adjust": "before-edge,text-before-edge,central,middle,hanging,mathematical",
    "drop-initial-before-align": "caps-height,baseline,use-script,before-edge,text-before-edge,after-edge,text-after-edge,central,middle,ideographic,alphabetic,hanging,mathematical",
    "drop-initial-size": "auto,line",
    "drop-initial-value": "",
    "elevation": "below,level,above,higher,lower",
    "empty-cells": "show,hide",
    "enable-background": "",
    "fill": "",
    "fill-opacity": "",
    "fill-rule": "",
    "filter": "",
    "fit": "fill,hidden,meet,slice",
    "fit-position": "",
    "flex": "",
    "flex-basis": "",
    "flex-direction": "row,row-reverse,column,column-reverse",
    "flex-flow": "",
    "flex-grow": "",
    "flex-shrink": "",
    "flex-wrap": "nowrap,wrap,wrap-reverse",
    "float": "left,right,none",
    "float-offset": "",
    "flood-color": "",
    "flood-opacity": "",
    "font": "",
    "font-family": "",
    "font-feature-settings": "normal",
    "font-kerning": "auto,normal,none,unset",
    "font-size": "",
    "font-size-adjust": "none",
    "font-stretch": "normal,ultra-condensed,extra-condensed,condensed,semi-condensed,semi-expanded,expanded,extra-expanded,ultra-expanded",
    "font-style": "normal,italic,oblique",
    "font-variant": "normal,small-caps",
    "font-variant-caps": "normal,small-caps,all-small-caps,petite-caps,all-petite-caps,unicase,titling-caps",
    "font-variant-position": "normal,sub,super,unset",
    "font-weight": "normal,bold,bolder,lighter,100,200,300,400,500,600,700,800,900",
    "glyph-orientation-horizontal": "",
    "glyph-orientation-vertical": "",
    "grid": "",
    "grid-area": "",
    "grid-auto-columns": "",
    "grid-auto-flow": "",
    "grid-auto-position": "",
    "grid-auto-rows": "",
    "grid-cell-stacking": "columns,rows,layer",
    "grid-column": "",
    "grid-columns": "",
    "grid-column-align": "start,end,center,stretch",
    "grid-column-sizing": "",
    "grid-column-start": "",
    "grid-column-end": "",
    "grid-column-span": "",
    "grid-flow": "none,rows,columns",
    "grid-layer": "",
    "grid-row": "",
    "grid-rows": "",
    "grid-row-align": "start,end,center,stretch",
    "grid-row-start": "",
    "grid-row-end": "",
    "grid-row-span": "",
    "grid-row-sizing": "",
    "grid-template": "",
    "grid-template-areas": "",
    "grid-template-columns": "",
    "grid-template-rows": "",
    "hanging-punctuation": "",
    "height": "",
    "hyphenate-after": "auto",
    "hyphenate-before": "auto",
    "hyphenate-character": "auto",
    "hyphenate-lines": "no-limit",
    "hyphenate-resource": "",
    "hyphens": "none,manual,auto",
    "icon": "",
    "image-orientation": "angle,auto",
    "image-rendering": "",
    "image-resolution": "",
    "ime-mode": "auto,normal,active,inactive,disabled",
    "inline-box-align": "last",
    "justify-content": "flex-start,flex-end,center,space-between,space-around",
    "left": "<margin-width>",
    "letter-spacing": "normal",
    "lighting-color": "",
    "line-height": "normal",
    "line-break": "auto,loose,normal,strict",
    "line-stacking": "",
    "line-stacking-ruby": "exclude-ruby,include-ruby",
    "line-stacking-shift": "consider-shifts,disregard-shifts",
    "line-stacking-strategy": "inline-line-height,block-line-height,max-height,grid-height",
    "list-style": "",
    "list-style-image": "none",
    "list-style-position": "inside,outside",
    "list-style-type": "disc,circle,square,decimal,decimal-leading-zero,lower-roman,upper-roman,lower-greek,lower-latin,upper-latin,armenian,georgian,lower-alpha,upper-alpha,none",
    "margin": "<margin-width>",
    "margin-bottom": "<margin-width>",
    "margin-left": "<margin-width>",
    "margin-right": "<margin-width>",
    "margin-top": "<margin-width>",
    "mark": "",
    "mark-after": "",
    "mark-before": "",
    "marker": "",
    "marker-end": "",
    "marker-mid": "",
    "marker-start": "",
    "marks": "",
    "marquee-direction": "",
    "marquee-play-count": "",
    "marquee-speed": "",
    "marquee-style": "",
    "mask": "",
    "max-height": "",
    "max-width": "",
    "min-height": "",
    "min-width": "",
    "move-to": "",
    "nav-down": "",
    "nav-index": "",
    "nav-left": "",
    "nav-right": "",
    "nav-up": "",
    "object-fit": "fill,contain,cover,none,scale-down",
    "object-position": "<bg-position>",
    "opacity": "",
    "order": "",
    "orphans": "",
    "outline": "",
    "outline-color": "",
    "outline-offset": "",
    "outline-style": "<border-style>",
    "outline-width": "<border-width>",
    "overflow": "<overflow>",
    "overflow-style": "",
    "overflow-wrap": "normal,break-word",
    "overflow-x": "<overflow>",
    "overflow-y": "<overflow>",
    "padding": "",
    "padding-bottom": "",
    "padding-left": "",
    "padding-right": "",
    "padding-top": "",
    "page": "",
    "page-break-after": "auto,always,avoid,left,right",
    "page-break-before": "auto,always,avoid,left,right",
    "page-break-inside": "auto,avoid",
    "page-policy": "",
    "pause": "",
    "pause-after": "",
    "pause-before": "",
    "perspective": "",
    "perspective-origin": "",
    "phonemes": "",
    "pitch": "",
    "pitch-range": "",
    "play-during": "",
    "pointer-events": "auto,none,visiblePainted,visibleFill,visibleStroke,visible,painted,fill,stroke,all",
    "position": "static,relative,absolute,fixed",
    "presentation-level": "",
    "punctuation-trim": "",
    "quotes": "",
    "rendering-intent": "",
    "resize": "",
    "rest": "",
    "rest-after": "",
    "rest-before": "",
    "richness": "",
    "right": "<margin-width>",
    "rotation": "",
    "rotation-point": "",
    "ruby-align": "",
    "ruby-overhang": "",
    "ruby-position": "",
    "ruby-span": "",
    "shape-rendering": "",
    "stop-color": "",
    "stop-opacity": "",
    "stroke": "",
    "stroke-dasharray": "",
    "stroke-dashoffset": "",
    "stroke-linecap": "",
    "stroke-linejoin": "",
    "stroke-miterlimit": "",
    "stroke-opacity": "",
    "stroke-width": "",
    "size": "",
    "speak": "normal,none,spell-out",
    "speak-header": "once,always",
    "speak-numeral": "digits,continuous",
    "speak-punctuation": "code,none",
    "speech-rate": "",
    "src": "",
    "stress": "",
    "string-set": "",
    "table-layout": "auto,fixed",
    "tab-size": "",
    "target": "",
    "target-name": "",
    "target-new": "",
    "target-position": "",
    "text-align": "left,right,center,justify,match-parent,start,end",
    "text-align-last": "",
    "text-anchor": "",
    "text-decoration": "none,underline,overline,line-through",
    "text-emphasis": "",
    "text-height": "",
    "text-indent": "",
    "text-justify": "auto,none,inter-word,inter-ideograph,inter-cluster,distribute,kashida",
    "text-outline": "",
    "text-overflow": "clip,ellipsis",
    "text-rendering": "auto,optimizeSpeed,optimizeLegibility,geometricPrecision",
    "text-shadow": "",
    "text-transform": "capitalize,uppercase,lowercase,none",
    "text-wrap": "normal,none,avoid",
    "top": "<margin-width>",
    "touch-action": "auto,none,pan-x,pan-y",
    "transform": "",
    "transform-origin": "",
    "transform-style": "",
    "transition": "",
    "transition-delay": "",
    "transition-duration": "",
    "transition-property": "",
    "transition-timing-function": "",
    "unicode-bidi": "normal,embed,isolate,bidi-override,isolate-override,plaintext",
    "user-modify": "read-only,read-write,write-only",
    "user-select": "none,text,toggle,element,elements,all",
    "vertical-align": "auto,use-script,baseline,sub,super,top,text-top,central,middle,bottom,text-bottom",
    "visibility": "visible,hidden,collapse",
    "voice-balance": "",
    "voice-duration": "",
    "voice-family": "",
    "voice-pitch": "",
    "voice-pitch-range": "",
    "voice-rate": "",
    "voice-stress": "",
    "voice-volume": "",
    "volume": "",
    "white-space": "normal,pre,nowrap,pre-wrap,pre-line,-pre-wrap,-o-pre-wrap,-moz-pre-wrap,-hp-pre-wrap",
    "white-space-collapse": "",
    "widows": "",
    "width": "",
    "will-change": "",
    "word-break": "normal,keep-all,break-all",
    "word-spacing": "normal",
    "word-wrap": "normal,break-word",
    "writing-mode": "horizontal-tb,vertical-rl,vertical-lr,lr-tb,rl-tb,tb-rl,bt-rl,tb-lr,bt-lr,lr-bt,rl-bt,lr,rl,tb",
    "z-index": "auto",
    "anchor-point": "",
    "flow-from": "",
    "flow-into": "",
    "font-language-override": "",
    "font-synthesis": "",
    "font-variant-alternates": "",
    "font-variant-east-asian": "",
    "font-variant-ligatures": "",
    "font-variant-numeric": "",
    "marker-offset": "",
    "marquee-loop": "",
    "region-break-after": "",
    "region-break-before": "",
    "region-break-inside": "",
    "region-fragment": "",
    "shape-image-threshold": "",
    "shape-inside": "",
    "shape-margin": "",
    "shape-outside": "",
    "speak-as": "",
    "text-decoration-color": "",
    "text-decoration-line": "",
    "text-decoration-skip": "",
    "text-decoration-style": "",
    "text-emphasis-color": "",
    "text-emphasis-position": "",
    "text-emphasis-style": "",
    "text-size-adjust": "",
    "text-space-collapse": "",
    "text-underline-position": "",
    "voice-range": ""
};

   var propertyKeywords_ = [];
   for (var prop in cssProperties) {
      
      propertyKeywords_.push(prop);
   }
   
   propertyKeywords_ = propertyKeywords_.sort();
   var propertyKeywords = keySet(propertyKeywords_);

  var nonStandardPropertyKeywords_ = [
    "scrollbar-arrow-color", "scrollbar-base-color", "scrollbar-dark-shadow-color",
    "scrollbar-face-color", "scrollbar-highlight-color", "scrollbar-shadow-color",
    "scrollbar-3d-light-color", "scrollbar-track-color", "shape-inside",
    "searchfield-cancel-button", "searchfield-decoration", "searchfield-results-button",
    "searchfield-results-decoration", "zoom"
  ], nonStandardPropertyKeywords = keySet(nonStandardPropertyKeywords_);

  var fontProperties_ = [
    "font-family", "src", "unicode-range", "font-variant", "font-feature-settings",
    "font-stretch", "font-weight", "font-style"
  ], fontProperties = keySet(fontProperties_);

  var counterDescriptors_ = [
    "additive-symbols", "fallback", "negative", "pad", "prefix", "range",
    "speak-as", "suffix", "symbols", "system"
  ], counterDescriptors = keySet(counterDescriptors_);

  var colorKeywords_ = [
    "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
    "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
    "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue",
    "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod",
    "darkgray", "darkgreen", "darkkhaki", "darkmagenta", "darkolivegreen",
    "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkturquoise", "darkviolet",
    "deeppink", "deepskyblue", "dimgray", "dodgerblue", "firebrick",
    "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite",
    "gold", "goldenrod", "gray", "grey", "green", "greenyellow", "honeydew",
    "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
    "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
    "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightpink",
    "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
    "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta",
    "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
    "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
    "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin",
    "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered",
    "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred",
    "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue",
    "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown",
    "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue",
    "slateblue", "slategray", "snow", "springgreen", "steelblue", "tan",
    "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white",
    "whitesmoke", "yellow", "yellowgreen"
  ], colorKeywords = keySet(colorKeywords_);

var commonCssValues = {
    "<box>": "padding-box,border-box,content-box",
    "<color>": colorKeywords_.toString(),
    "<border-width>": "thin,medium,thick",
    "<border-style>": "none,hidden,dotted,dashed,solid,double,groove,ridge,inset,outset",
    "<margin-width>": "auto",
    "<bg-position>": "left,right,top,bottom,center",
    "<overflow>": "visible,hidden,scroll,auto"
    
};
   var valueKeywords_ = [];
   var buildValues = new Object;
   for (var prop in cssProperties) {
      var val = cssProperties[prop];
      if (val != "") {
         var eachVal = val.split(",");
         var arrayLength = eachVal.length;
         for (var i = 0; i < arrayLength; i++) {
            var singVal = eachVal[i];
            if (singVal.indexOf("<") == -1) {
               buildValues[singVal] = "";
            }
         }
      }
   }
   for (var prop in commonCssValues) {
      if (prop != "<color>") {
         var val = commonCssValues[prop];
         var eachVal = val.split(",");
         var arrayLength = eachVal.length;
         for (var i = 0; i < arrayLength; i++) {
            buildValues[eachVal[i]] = "";
         }
      }
   }

   for (var prop in buildValues) {
      valueKeywords_.push(prop);
   }
   
  var valueKeywords = keySet(valueKeywords_);

  var allWords = documentTypes_.concat(mediaTypes_).concat(mediaFeatures_).concat(mediaValueKeywords_)
    .concat(propertyKeywords_).concat(nonStandardPropertyKeywords_).concat(colorKeywords_)
    .concat(valueKeywords_);

  CodeMirror.registerHelper("hintWords", "css", allWords);

  function tokenCComment(stream, state) {
    var maybeEnd = false, ch;
    while ((ch = stream.next()) != null) {
      if (maybeEnd && ch == "/") {
        state.tokenize = null;
        break;
      }
      maybeEnd = (ch == "*");
    }
    return ["comment", "comment"];
  }

  CodeMirror.defineMIME("text/css", {
    documentTypes: documentTypes,
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    mediaValueKeywords: mediaValueKeywords,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    fontProperties: fontProperties,
    counterDescriptors: counterDescriptors,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    cssProperties: cssProperties,
    commonCssValues: commonCssValues,
    tokenHooks: {
      "/": function(stream, state) {
        if (!stream.eat("*")) return false;
        state.tokenize = tokenCComment;
        return tokenCComment(stream, state);
      }
    },
    name: "css"
  });

  CodeMirror.defineMIME("text/x-scss", {
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    mediaValueKeywords: mediaValueKeywords,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    fontProperties: fontProperties,
    cssProperties: cssProperties,
    commonCssValues: commonCssValues,
    allowNested: true,
    tokenHooks: {
      "/": function(stream, state) {
        if (stream.eat("/")) {
          stream.skipToEnd();
          return ["comment", "comment"];
        } else if (stream.eat("*")) {
          state.tokenize = tokenCComment;
          return tokenCComment(stream, state);
        } else {
          return ["operator", "operator"];
        }
      },
      ":": function(stream) {
        if (stream.match(/\s*\{/))
          return [null, "{"];
        return false;
      },
      "$": function(stream) {
        stream.match(/^[\w-]+/);
        if (stream.match(/^\s*:/, false))
          return ["variable-2", "variable-definition"];
        return ["variable-2", "variable"];
      },
      "#": function(stream) {
        if (!stream.eat("{")) return false;
        return [null, "interpolation"];
      }
    },
    name: "css",
    helperType: "scss"
  });

  CodeMirror.defineMIME("text/x-less", {
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    mediaValueKeywords: mediaValueKeywords,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    fontProperties: fontProperties,
    cssProperties: cssProperties,
    commonCssValues: commonCssValues,
    allowNested: true,
    tokenHooks: {
      "/": function(stream, state) {
        if (stream.eat("/")) {
          stream.skipToEnd();
          return ["comment", "comment"];
        } else if (stream.eat("*")) {
          state.tokenize = tokenCComment;
          return tokenCComment(stream, state);
        } else {
          return ["operator", "operator"];
        }
      },
      "@": function(stream) {
        if (stream.eat("{")) return [null, "interpolation"];
        if (stream.match(/^(charset|document|font-face|import|(-(moz|ms|o|webkit)-)?keyframes|media|namespace|page|supports)\b/, false)) return false;
        stream.eatWhile(/[\w\\\-]/);
        if (stream.match(/^\s*:/, false))
          return ["variable-2", "variable-definition"];
        return ["variable-2", "variable"];
      },
      "&": function() {
        return ["atom", "atom"];
      }
    },
    name: "css",
    helperType: "less"
  });

  CodeMirror.defineMIME("text/x-gss", {
    documentTypes: documentTypes,
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    fontProperties: fontProperties,
    counterDescriptors: counterDescriptors,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    cssProperties: cssProperties,
    commonCssValues: commonCssValues,
    supportsAtComponent: true,
    tokenHooks: {
      "/": function(stream, state) {
        if (!stream.eat("*")) return false;
        state.tokenize = tokenCComment;
        return tokenCComment(stream, state);
      }
    },
    name: "css",
    helperType: "gss"
  });

});
