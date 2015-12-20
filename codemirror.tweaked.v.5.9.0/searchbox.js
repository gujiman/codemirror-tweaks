/* global CodeMirror */
/* global define */

(function(mod) {
    'use strict';
    
    if (typeof exports === 'object' && typeof module === 'object') // CommonJS
        mod(require('../../lib/codemirror'));
    else if (typeof define === 'function' && define.amd) // AMD
        define(['../../lib/codemirror'], mod);
    else
        mod(CodeMirror);
})(function(CodeMirror) {
    'use strict';
    
    var Search = new Object();
    
    CodeMirror.defineOption('searchbox', false, function(cm) {
        cm.addKeyMap({
            'Ctrl-F': function() {
               ConstructSearch(cm);
            },
            
            'Esc': function() {
                var id = cm.getOption("parentID");
                if (Search[id] && Search[id].isVisible()) {
                    Search[id].hide();
                    
                    if (typeof event !== 'undefined')
                        event.stopPropagation();
                }
                
                return false;
            },
            
            'Cmd-F': function() {
               ConstructSearch(cm);
            }
        });
        

    });
    
   CodeMirror.defineExtension("hideSearchBox", function (cm) {
      var id = cm.getOption("parentID");
      
      if (Search[id]){
         Search[id].hide();
      }
      if (Search['allScriptsplit']){
         Search['allScriptsplit'].hide();
      }
      
   });
    
   CodeMirror.defineExtension("triggSearch", function (cm) {
      var id = cm.getOption("parentID");
      if (Search[id] && Search[id].isVisible()) {
         Search[id].hide();
      }else{
         ConstructSearch(cm);
      }
   });
  
    function ConstructSearch(cm){

      if (cm.getOption("searchbox") == true) {
         var id = cm.getOption("parentID");
         
         if ($("#" + id).children(".ace_search").length == 0){
            if (Search[id]){
               delete Search[id];
            }
            Search[id] = new SearchBox(cm);
            
         }
         Search[id].show(cm.doc.getSelection());

      }
    }
    
    function SearchBox(cm) {
        var self = this;

        init();
        
        function initElements(el) {
            self.searchBox              = el.querySelector('.ace_search_form');
            self.replaceBox             = el.querySelector('.ace_replace_form');
            self.searchOptions          = el.querySelector('.ace_search_options');
            
            self.regExpOption           = el.querySelector('[action=toggleRegexpMode]');
            self.caseSensitiveOption    = el.querySelector('[action=toggleCaseSensitive]');
            self.wholeWordOption        = el.querySelector('[action=toggleWholeWords]');
            
            self.searchInput            = self.searchBox.querySelector('.ace_search_field');
            self.replaceInput           = self.replaceBox.querySelector('.ace_search_field');
            
            self.close                  = el.querySelector('.close');
            
            self.element.style.display = 'none';
        }
        
        function init() {
            var el = self.element = addHtml();
            
            initElements(el);
            bindKeys();
            
            el.addEventListener('mousedown', function(e) {
                setTimeout(function(){
                    self.activeInput.focus();
                }, 0);
                
                e.stopPropagation();
            });
            
            el.addEventListener('click', function(e) {
                var t = e.target || e.srcElement;
                var action = t.getAttribute('action');
                if (action && self[action])
                    self[action]();
                else if (self.commands[action])
                    self.commands[action]();
                
                e.stopPropagation();
            });
            
            self.searchInput.addEventListener('input', function() {
                self.$onChange.schedule(20);
            });
            
            self.searchInput.addEventListener('focus', function() {
                self.activeInput = self.searchInput;
            });
            
            self.replaceInput.addEventListener('focus', function() {
                self.activeInput = self.replaceInput;
            });
            
            self.close.addEventListener('click', function(e) {
                setTimeout(function() { self.hide();});
                e.stopPropagation();
            });
            self.$onChange = delayedCall(function() {
                self.find(false, false);
            });
        }
        
        function bindKeys() {
            var sb  = self,
                obj = {
                    'Ctrl-F|Cmd-F|Ctrl-H|Command-Alt-F': function() {
                        sb.searchInput.focus();
                    },
                    'Ctrl-G|Cmd-G': function() {
                        sb.findNext();
                    },
                    'Ctrl-Shift-G|Cmd-Shift-G': function() {
                        sb.findPrev();
                    },
                    'Esc': function() {
                        setTimeout(function() { sb.hide();});
                    },
                    'Enter': function() {
                        if (sb.activeInput === sb.replaceInput)
                            sb.replace();
                        sb.findNext();
                    },
                    'Shift-Enter': function() {
                        if (sb.activeInput === sb.replaceInput)
                            sb.replace();
                        sb.findPrev();
                    },
                    'Tab': function() {
                        if (self.activeInput === self.replaceInput)
                            self.searchInput.focus();
                        else
                            self.replaceInput.focus();
                    }
                };
            
            self.element.addEventListener('keydown', function(event) {
                Object.keys(obj).some(function(name) {
                    var is = key(name, event);
                    
                    if (is) {
                        event.stopPropagation();
                        event.preventDefault();
                        obj[name](event);
                    }
                    
                    return is;
                });
            });
        }
        
        this.commands   = {
            toggleRegexpMode: function() {
                self.regExpOption.checked = !self.regExpOption.checked;
                self.$syncOptions();
            },
            
            toggleCaseSensitive: function() {
                self.caseSensitiveOption.checked = !self.caseSensitiveOption.checked;
                self.$syncOptions();
            },
            
            toggleWholeWords: function() {
                self.wholeWordOption.checked = !self.wholeWordOption.checked;
                self.$syncOptions();
            }
        };
        
        this.$syncOptions = function() {
            setCssClass(this.regExpOption, 'checked', this.regExpOption.checked);
            setCssClass(this.wholeWordOption, 'checked', this.wholeWordOption.checked);
            setCssClass(this.caseSensitiveOption, 'checked', this.caseSensitiveOption.checked);
            
            this.find(false, false);
        };
        
        this.find = function(skipCurrent, backwards) {
            var value   = this.searchInput.value,
                options = {
                    skipCurrent: skipCurrent,
                    backwards: backwards,
                    regExp: this.regExpOption.checked,
                    caseSensitive: this.caseSensitiveOption.checked,
                    wholeWord: this.wholeWordOption.checked
                };
            
            find(value, options, function(searchCursor) {
                var current = searchCursor.matches(false, searchCursor.from());
                cm.setSelection(current.from, current.to);
            });
        };
        
        function find(value, options, callback) {
            var done,
                noMatch, searchCursor, next, prev, matches, cursor,
                position,
                val             = value,
                o               = options,
                is              = true,
                caseSensitive   = o.caseSensitive,
                regExp          = o.regExp,
                wholeWord       = o.wholeWord;
            
            if (regExp || wholeWord) {
                if (options.wholeWord)
                    val   = '\\b' + val + '\\b';
                
                val   = RegExp(val);
            }
            
            if (o.backwards)
                position = o.skipCurrent ? 'from': 'to';
            else
                position = o.skipCurrent ? 'to' : 'from';
                
            cursor          = cm.getCursor(position);
            searchCursor    = cm.getSearchCursor(val, cursor, !caseSensitive);
            
            next            = searchCursor.findNext.bind(searchCursor),
            prev            = searchCursor.findPrevious.bind(searchCursor),
            matches         = searchCursor.matches.bind(searchCursor);
            
            if (o.backwards && !prev()) {
                is = next();
                
                if (is) {
                    cm.setCursor(cm.doc.size - 1, 0);
                    find(value, options, callback);
                    done = true;
                }
            } else if (!o.backwards && !next()) {
                is = prev();
                
                if (is) {
                    cm.setCursor(0, 0);
                    find(value, options, callback);
                    done = true;
                }
            }
            
            noMatch             = !is && self.searchInput.value;
            setCssClass(self.searchBox, 'ace_nomatch', noMatch);
            
            if (!done && is){
                callback(searchCursor);
            }
            
            if (value == ""){
               cm.setCursor(cm.getCursor());
            }
        }
        
        this.findNext = function() {
            this.find(true, false);
        };
        
        this.findPrev = function() {
            this.find(true, true);
        };
        
        
        
        this.replace = function() {
            var readOnly    = cm.getOption('readOnly'),
                isSelection = !!cm.getSelection();
            
            if (!readOnly && isSelection)
                cm.replaceSelection(this.replaceInput.value, 'start');
        };
        
        this.replaceAndFindNext = function() {
            var readOnly = cm.getOption('readOnly');
            
            if (!readOnly) {
                this.replace();
                this.findNext();
            }
        };
        
        this.replaceAll = function() {
            var value,
                cursor,
                from    = this.searchInput.value,
                to      = this.replaceInput.value,
                reg     = RegExp(from, 'g');
            
            if (!cm.getOption('readOnly')) {
                cursor  = cm.getCursor();
                value   = cm.getValue();
                value   = value.replace(reg, to);
                
                cm.setValue(value);
                cm.setCursor(cursor);
            }
        };
        
        this.hide = function() {
            this.element.style.display = 'none';
            cm.focus();
            var id = cm.getOption("parentID");
            $("#" + id).children(".CodeMirror").css("height","100%");
        };
        
        this.isVisible = function() {
            var is = this.element.style.display === '';
            
            return is;
        };
        
        this.show = function(value) {
           
           
            var isNone = this.element.style.display;
            this.element.style.display = '';

            
            if (value)
                this.searchInput.value = value;
            
            this.searchInput.focus();
            this.searchInput.select();
            
            var id = cm.getOption("parentID");
            var editor = $("#" + id).children(".CodeMirror");
            var searchBX = $("#" + id).children(".ace_search"); 
            
            
            if (isNone == "none"){
               editor.css("height",editor.outerHeight(false) - searchBX.outerHeight(false));
            }
            
            
        };
        
        this.isFocused = function() {
            var el = document.activeElement;
            return el === this.searchInput || el === this.replaceInput;
        };
        
        
        
        function addHtml() {
            var id = cm.getOption("parentID");
            var elSearch,
                el      = document.getElementById(id),
                div     = document.createElement('div'),
                html    = [
                    '<div class="serach_id_' + id + ' ace_search form-inline alert alert-success alert-dismissible" role="alert">',
                        '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>',
                        '<div class="ace_search_form">',
                            '<input class="ace_search_field" placeholder="Search for" spellcheck="false"></input>',
                            '<button type="button" action="findNext" class="btn btn-link">Next</button>',
                            '<button type="button" action="findPrev" class="btn btn-link">Previous</button>',
                        '</div>',
                        '<div class="ace_replace_form">',
                            '<input class="ace_search_field" placeholder="Replace with" spellcheck="false"></input>',
                            '<button type="button" action="replaceAndFindNext" class="btn btn-link">Replace</button>',
                            '<button type="button" action="replaceAll" class="btn btn-link">All</button>',
                        '</div>',
                        '<div class="ace_search_options form-group form-group-sm">',
                            '<span action="toggleRegexpMode" class="ace_button" title="RegExp Search" data-toggle="tooltip" data-placement="top" data-trigger="hover">.*</span>',
                            '<span action="toggleCaseSensitive" class="ace_button" title="Case Sensitive Search" data-toggle="tooltip" data-placement="top" data-trigger="hover">Aa</span>',
                            '<span action="toggleWholeWords" class="ace_button" title="Whole Word Search" data-toggle="tooltip" data-placement="top" data-trigger="hover">\\b</span>',
                        '</div>',
                    '</div>'
                ].join('');
            
            div.innerHTML = html;
            
            elSearch = div.firstChild;
            
            el.appendChild(elSearch);
            
            if (cm.getOption("readOnly") == true){
                $("#" + id).children(".ace_search").find(".ace_replace_form").hide();
            }
            $(".serach_id_" + id).find('[data-toggle="tooltip"]').tooltip({container: 'body'});
            
            return elSearch;
        }
    }
    
    function setCssClass(el, className, condition) {
        var list = el.classList;
        
        list[condition ? 'add' : 'remove'](className);
    }
    
    function delayedCall(fcn, defaultTimeout) {
        var timer,
            callback = function() {
                timer = null;
                fcn();
            },
            
            _self = function(timeout) {
                if (!timer)
                    timer = setTimeout(callback, timeout || defaultTimeout);
            };
        
        _self.delay = function(timeout) {
            timer && clearTimeout(timer);
            timer = setTimeout(callback, timeout || defaultTimeout);
        };
        _self.schedule = _self;
        
        _self.call = function() {
            this.cancel();
            fcn();
        };
        
        _self.cancel = function() {
            timer && clearTimeout(timer);
            timer = null;
        };
        
        _self.isPending = function() {
            return timer;
        };
    
        return _self;
    }
    
    /* https://github.com/coderaiser/key */
    function key(str, event) {
        var right,
            KEY = {
                BACKSPACE   : 8,
                TAB         : 9,
                ENTER       : 13,
                ESC         : 27,
                
                SPACE       : 32,
                PAGE_UP     : 33,
                PAGE_DOWN   : 34,
                END         : 35,
                HOME        : 36,
                UP          : 38,
                DOWN        : 40,
                
                INSERT      : 45,
                DELETE      : 46,
                
                INSERT_MAC  : 96,
                
                ASTERISK    : 106,
                PLUS        : 107,
                MINUS       : 109,
                
                F1          : 112,
                F2          : 113,
                F3          : 114,
                F4          : 115,
                F5          : 116,
                F6          : 117,
                F7          : 118,
                F8          : 119,
                F9          : 120,
                F10         : 121,
                
                SLASH       : 191,
                TRA         : 192, /* Typewritten Reverse Apostrophe (`) */
                BACKSLASH   : 220
            };
        
        keyCheck(str, event);
        
        right = str.split('|').some(function(combination) {
            var wrong;
            
            wrong = combination.split('-').some(function(key) {
                var right;
                
                switch(key) {
                case 'Ctrl':
                    right = event.ctrlKey;
                    break;
                
                case 'Shift':
                    right = event.shiftKey;
                    break;
                
                case 'Alt':
                    right = event.altKey;
                    break;
                
                case 'Cmd':
                    right = event.metaKey;
                    break;
                
                default:
                    if (key.length === 1)
                        right = event.keyCode === key.charCodeAt(0);
                    else
                        Object.keys(KEY).some(function(name) {
                            var up = key.toUpperCase();
                            
                            if (up === name)
                                right = event.keyCode === KEY[name];
                        });
                    break;
                }
                
                return !right;
            });
            
            return !wrong;
        });
        
        return right;
    }
    
    function keyCheck(str, event) {
        if (typeof str !== 'string')
            throw(Error('str should be string!'));
        
        if (typeof event !== 'object')
            throw(Error('event should be object!'));
    }

});