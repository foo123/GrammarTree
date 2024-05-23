/**
*   GrammarTree,
*   grammar to abstract syntax tree, generic parser for JavaScript / Python / PHP
*
*   @version: 0.9.0
*   https://github.com/foo123/GrammarTree
*
**/
!function(root, name, factory) {
"use strict";
if ( ('undefined'!==typeof Components)&&('object'===typeof Components.classes)&&('object'===typeof Components.classesByID)&&Components.utils&&('function'===typeof Components.utils['import']) ) /* XPCOM */
    (root.$deps = root.$deps||{}) && (root.EXPORTED_SYMBOLS = [name]) && (root[name] = root.$deps[name] = factory.call(root));
else if ( ('object'===typeof module)&&module.exports ) /* CommonJS */
    (module.$deps = module.$deps||{}) && (module.exports = module.$deps[name] = factory.call(root));
else if ( ('function'===typeof define)&&define.amd&&('function'===typeof require)&&('function'===typeof require.specified)&&require.specified(name) /*&& !require.defined(name)*/ ) /* AMD */
    define(name,['module'],function(module){factory.moduleUri = module.uri; return factory.call(root);});
else if ( !(name in root) ) /* Browser/WebWorker/.. */
    (root[name] = factory.call(root)||1)&&('function'===typeof(define))&&define.amd&&define(function(){return root[name];});
}(  /* current root */          'undefined' !== typeof self ? self : this,
    /* module name */           "GrammarTree",
    /* module factory */        function ModuleFactory__GrammarTree(undef) {
"use strict";

/*
In GrammarTree use actions to signify operator precedence and assiciativity.. eg mark begining/end of priority rule via action tokens, or mark associativity via action token..
*/

// types
var
    TOKENS = 1, ERRORS = 2, FLAT = 32, REQUIRED = 4, ERROR = 8,
    CLEAR_REQUIRED = ~REQUIRED, CLEAR_ERROR = ~ERROR, REQUIRED_OR_ERROR = REQUIRED | ERROR,

    // action types
    A_NOP = 0, A_ERROR = 4,
    A_DEFINE = 8, A_UNDEFINE = 9,
    A_DEFINED = 10, A_NOTDEFINED = 11, A_UNIQUE = 12,
    A_CTXSTART = 16, A_CTXEND = 17,
    A_HYPCTXSTART = 18, A_HYPCTXEND = 19,
    A_MCHSTART = 32, A_MCHEND = 33,
    A_PRECEDE = 64, A_ASSOCIAT = 128,

    // pattern types
    P_SIMPLE = 2,
    P_COMPOSITE = 4,
    P_BLOCK = 8,

    // token types
    T_ACTION = 4,
    T_SOF = 8, T_FNBL = 9, T_EOL = 16/*=T_NULL*/, T_SOL = 32, T_EOF = 64,
    T_EMPTY = 128, T_NONSPACE = 256,
    T_INDENTATION = 129, T_DEDENTATION = 130, /*TODO*/
    T_SIMPLE = 512,
    T_BLOCK = 1024, T_COMMENT = 1025,
    T_ALTERNATION = 2048,
    T_SEQUENCE = 4096,
    T_REPEATED = 8192, T_ZEROORONE = 8193, T_ZEROORMORE = 8194, T_ONEORMORE = 8195,
    T_LOOKAHEAD = 16384, T_POSITIVE_LOOKAHEAD = T_LOOKAHEAD, T_NEGATIVE_LOOKAHEAD = 16385,
    T_SUBGRAMMAR = 65536,
    T_COMPOSITE = T_ALTERNATION|T_SEQUENCE|T_REPEATED|T_LOOKAHEAD|T_SUBGRAMMAR,

    // tokenizer types
    tokenTypes = {
        action: T_ACTION,
        simple: T_SIMPLE,
        block: T_BLOCK, comment: T_COMMENT,
        subgrammar: T_SUBGRAMMAR,
        alternation: T_ALTERNATION,
        sequence: T_SEQUENCE,
        repeat: T_REPEATED, zeroorone: T_ZEROORONE, zeroormore: T_ZEROORMORE, oneormore: T_ONEORMORE,
        positivelookahead: T_POSITIVE_LOOKAHEAD, negativelookahead: T_NEGATIVE_LOOKAHEAD
    },

    $T_SOF$ = '$|SOF|$', $T_FNBL$ = '$|NONBLANK|$', $T_SOL$ = '$|SOL|$', $T_EOL$ = '$|EOL|$', $T_NULL$ = '$|ENDLINE|$',
    $T_EMPTY$ = '$|EMPTY|$', $T_NONSPACE$ = '$|NONSPACE|$'
    //$T_SPACE$ = '$|SPACE|$'
;


var PROTO = 'prototype', stdMath = Math,
    OP = Object[PROTO], toString = OP.toString, Extend = Object.create,
    MAX = stdMath.max, MIN = stdMath.min, LOWER = 'toLowerCase', CHAR = 'charAt',
    HAS = OP.hasOwnProperty, IS_ENUM = OP.propertyIsEnumerable, KEYS = Object.keys,

    // types
    INF = Infinity,
    T_UNKNOWN = 4, T_UNDEF = 8, T_NULL = 16,
    T_NUM = 32, T_INF = 33, T_NAN = 34, T_BOOL = 64,
    T_STR = 128, T_CHAR = 129, T_CHARLIST = 130,
    T_ARRAY = 256, T_OBJ = 512, T_FUNC = 1024, T_REGEX = 2048, T_XREGEX = 2049, T_DATE = 4096,
    T_STR_OR_NUM = T_STR|T_NUM,
    T_STR_OR_ARRAY = T_STR|T_ARRAY,
    T_OBJ_OR_ARRAY = T_OBJ|T_ARRAY,
    T_REGEX_OR_ARRAY = T_REGEX|T_ARRAY,
    T_STR_OR_ARRAY_OR_REGEX = T_STR|T_ARRAY|T_REGEX,
    TYPE_STRING = {
    "[object Number]"   : T_NUM,
    "[object String]"   : T_STR,
    "[object Array]"    : T_ARRAY,
    "[object RegExp]"   : T_REGEX,
    "[object Date]"     : T_DATE,
    "[object Function]" : T_FUNC,
    "[object Object]"   : T_OBJ
    },

    trim_re = /^\s+|\s+$/g,
    trim = String[PROTO].trim
        ? function( s ){ return s.trim(); }
        : function( s ){ return s.replace(trim_re, ''); },

    by_length = function( a, b ) {
        return b.length - a.length
    },

    newline_re = /\r\n|\r|\n/g, dashes_re = /[\-_]/g,
    /*regex_pattern_re = /(\\\\)*?\\\d/,*/ extended_regex_re = /(l?i?l?)x(l?i?l?)$/,

    _id_ = 0,

    // tokenizer helpers
    escaped_re = /([.*+?^${}()|[\]\/\\\-])/g,
    peg_bnf_special_re = /^([.!&\[\]{}()*+?\/|'";]|\s)/,
    default_combine_delimiter = "\\b",
    combine_delimiter = "(\\s|\\W|$)" /* more flexible than \\b */,
    trailing_repeat_re = /[*+]$/
;

function get_type(v)
{
    var T = 0;
    if      (null === v)                   T = T_NULL;
    else if ((true === v) || (false === v) ||
                   (v instanceof Boolean)) T = T_BOOL;
    else if (undef === v)                  T = T_UNDEF;
    else
    {
    T = TYPE_STRING[toString.call(v)] || T_UNKNOWN;
    if      ((T_NUM === T)   || (v instanceof Number))   T = isNaN(v) ? T_NAN : (isFinite(v) ? T_NUM : T_INF);
    else if ((T_STR === T)   || (v instanceof String))   T = 1 === v.length ? T_CHAR : T_STR;
    else if ((T_ARRAY === T) || (v instanceof Array))    T = T_ARRAY;
    else if ((v instanceof RE))                          T = T_XREGEX;
    else if ((T_REGEX === T) || (v instanceof RegExp))   T = T_REGEX;
    else if ((T_DATE === T)  || (v instanceof Date))     T = T_DATE;
    else if ((T_FUNC === T)  || (v instanceof Function)) T = T_FUNC;
    else if ((T_OBJ === T))                              T = T_OBJ;
    else                                                 T = T_UNKNOWN;
    }
    return T;
}

function clone(o, deep)
{
    var T = get_type(o), T2, co, k, l, level = 0;
    if (T_NUM === get_type(deep))
    {
        if (0 < deep)
        {
            level = deep;
            deep = true;
        }
        else
        {
            deep = false;
        }
    }
    else
    {
        deep = false !== deep;
    }

    if (T_OBJ === T)
    {
        co = {};
        for (k in o)
        {
            if (!HAS.call(o,k) || !IS_ENUM.call(o,k)) continue;
            T2 = get_type(o[k]);

            if (T_OBJ === T2)         co[k] = deep ? clone(o[k], level>0 ? level-1 : deep) : o[k];
            else if (T_ARRAY === T2)  co[k] = deep ? clone(o[k], level>0 ? level-1 : deep) : o[k].slice();
            else if (T_STR & T2)      co[k] = o[k].slice();
            else if (T_NUM & T2)      co[k] = 0 + o[k];
            else                      co[k] = o[k];
        }
    }
    else if (T_ARRAY === T)
    {
        l = o.length;
        co = new Array(l);
        for (k=0; k<l; ++k)
        {
            T2 = get_type(o[k]);

            if (T_OBJ === T2)         co[k] = deep ? clone(o[k], level>0 ? level-1 : deep) : o[k];
            else if (T_ARRAY === T2)  co[k] = deep ? clone(o[k], level>0 ? level-1 : deep) : o[k].slice();
            else if (T_STR & T2)      co[k] = o[k].slice();
            else if (T_NUM & T2)      co[k] = 0 + o[k];
            else                      co[k] = o[k];
        }
    }
    else if (T_STR & T)
    {
        co = o.slice();
    }
    else if (T_NUM & T)
    {
        co = 0 + o;
    }
    else
    {
        co = o;
    }
    return co;
}

function extend(/* var args here.. */)
{
    var args = arguments, argslen = args.length,
        o2, o, i, k, j, l, a, a2, T, T2;

    if (argslen < 1) return null;

    o = clone(args[0]);

    for (i=1; i<argslen; ++i)
    {
        o2 = args[i];
        if (!o2) continue;

        for (k in o2)
        {
            if (!HAS.call(o2,k) || !IS_ENUM.call(o2,k)) continue;
            if (HAS.call(o,k) && IS_ENUM.call(o,k))
            {
                T = get_type(o[k]); T2 = get_type(o2[k]);
                if (T_OBJ === T && T_OBJ === T2)
                {
                    o[k] = extend(o[k], o2[k]);
                }
                else if (T_ARRAY === T && T_ARRAY === T2)
                {
                    a = o[k]; a2 = o2[k]; l = a2.length;
                    if (!l) continue;
                    else if (!a.length)
                    {
                        o[k] = a2.slice();
                    }
                    else
                    {
                        for (j=0; j<l; ++j)
                        {
                            if (0 > a.indexOf(a2[j]))
                                a.push(a2[j]);
                        }
                    }
                }
            }
            else
            {
                o[k] = clone(o2[k]);
            }
        }
    }
    return o;
}

function merge(/* var args here.. */)
{
    var args = arguments, argslen = args.length,
        o, o2, v, p, i, T;
    o = args[0] || {};
    for (i=1; i<argslen; ++i)
    {
        o2 = args[i];
        if (T_OBJ === get_type(o2))
        {
            for (p in o2)
            {
                if (!HAS.call(o2,p) || !IS_ENUM.call(o2,p)) continue;

                v = o2[p]; T = get_type(v);

                // shallow copy for numbers, better ??
                if (T_NUM & T) o[p] = 0 + v;

                // shallow copy for arrays or strings, better ??
                else if (T_STR_OR_ARRAY & T) o[p] = v.slice();

                // just reference copy
                else o[p] = v;
            }
        }
    }
    return o;
}

function make_array(a, force)
{
    return (force || (T_ARRAY !== get_type(a))) ? [a] : a;
}

function make_array_2(a, force)
{
    a = make_array(a);
    if (force || (T_ARRAY !== get_type(a[0]))) a = [a]; // array of arrays
    return a;
}

function flatten(a)
{
    // flatten array
    return a.reduce(function(flattened, x) {
        if (T_ARRAY === get_type(x))
            flattened.push.apply(flattened, flatten(x));
        else
            flattened.push(x);
        return flattened;
    }, []);
}

function has_prefix(s, p)
{
    return (
        (T_STR & get_type(p)) && (T_STR & get_type(s)) && p.length &&
        p.length <= s.length && p === s.substr(0, p.length)
    );
}

function del(o, p, soft)
{
    if (soft) o[p] = undef; else delete o[p];
    return o;
}

function get_id(ns) {return (ns||'id_') + (++_id_);}

function uuid(ns) {return (ns||'uuid') + '_' + String(++_id_) + '_' + String(new Date().getTime());}

function esc_re(s)
{
    return s.replace(escaped_re, '\\$1');
}

function RE(re, fl)
{
    var self = this;
    self.re = re;
    self.xflags = fl || {g:0,i:0,x:0,l:0};
}
function new_re(re, fl)
{
    fl = fl || {l:0,x:0,i:0,g:0};
    var re = new RE(new RegExp(re, (fl.g?'g':'')+(fl.i?'i':'')), fl);
    return re;
}

function get_delimited(src, delim, esc, collapse_esc)
{
    var i = src.pos||0, l = src.length, dl = delim.length, s = '', escaped;
    if (!!esc)
    {
        if (!!collapse_esc)
        {
            while (i<l)
            {
                escaped = false;
                if (esc === src[CHAR](i))
                {
                    escaped = true;
                    i += 1;
                }
                if (delim === src.substr(i,dl))
                {
                    i += dl;
                    if (escaped) s += delim;
                    else break;
                }
                else
                {
                    s += src[CHAR](i++);
                }
            }
        }
        else
        {
            while (i<l)
            {
                escaped = false;
                if (esc === src[CHAR](i))
                {
                    escaped = true;
                    i += 1;
                    s += esc;
                }
                if (delim === src.substr(i,dl))
                {
                    i += dl;
                    if (escaped) s += delim;
                    else break;
                }
                else
                {
                    s += src[CHAR](i++);
                }
            }
        }
    }
    else
    {
        while (i<l)
        {
            if (delim === src.substr(i,dl)) {i += dl; break;}
            s += src[CHAR](i++);
        }
    }
    src.pos = i;
    return s;
}

function group_replace(pattern, token, raw, in_regex)
{
    var i, l, c, g, replaced, offset = true === raw ? 0 : 1,
        placeholder = in_regex ? '\\' : '$', placeholder_code = in_regex ? 92 : 36;
    if (T_STR & get_type(token))
    {
        if (in_regex) token = esc_re(token);
        token = [token, token, token];
        offset = 0;
    }
    l = pattern.length; replaced = ''; i = 0;
    while (i<l)
    {
        c = pattern[CHAR](i);
        if ((i+1<l) && (placeholder === c))
        {
            g = pattern.charCodeAt(i+1);
            if (placeholder_code === g) // escaped placeholder character
            {
                replaced += placeholder;
                i += 2;
            }
            else if (48 <= g && g <= 57) // group between 0 and 9
            {
                replaced += token[offset + g - 48] || '';
                i += 2;
            }
            else
            {
                replaced += c;
                i += 1;
            }
        }
        else
        {
            replaced += c;
            i += 1;
        }
    }
    return replaced;
}

function Matcher(type, name, pattern, ptype, key)
{
    var self = this, PT, T;
    PT = self.type = type;
    self.name = name;
    self.pattern = pattern;
    T = self.ptype = ptype || T_STR;
    self.key = key || 0;
    if (P_COMPOSITE === PT)
    {
        self.key = false !== key;
    }
    else if (P_BLOCK === PT)
    {
        self.pattern[0] = new Matcher(P_COMPOSITE, name + '_Start', pattern[0], null, false);
    }
    else //if (P_SIMPLE === PT)
    {
        if (T_NULL === T)
            self.pattern = null;
        else if (T_REGEX === T)
            self.pattern = T_REGEX&get_type(pattern) ? [pattern, 0] : [pattern[0], pattern[1]||0];
    }
}
Matcher[PROTO] = {
    constructor: Matcher

    ,type: null
    ,name: null
    ,pattern: null
    ,ptype: null
    ,key: null

    ,dispose: function() {
        var self = this;
        self.type = null;
        self.name = null;
        self.pattern = null;
        self.ptype = null;
        self.key = null;
        return self;
    }

    ,match: function(stream, eat, any_match) {
        var self = this, PT = self.type, name, type,
            pattern = self.pattern, key = self.key,
            start, ends, end, match, m, T, T0, i, n, c
        ;

        if (P_BLOCK === PT)
        {
            name = self.name;
            start = pattern[0]; ends = pattern[1];

            // matches start of block using startMatcher
            // and returns the associated endBlock matcher
            if (match = start.match(stream, eat, any_match))
            {
                // use the token key to get the associated endMatcher
                end = ends[match[0]];
                T = get_type(end); T0 = start.pattern[match[0]].ptype;

                // regex group number given, get the matched group pattern for the ending of this block
                // string replacement pattern given, get the proper pattern for the ending of this block
                if ((T_REGEX === T0) && (T_STR_OR_NUM & T))
                {
                    // the regex is wrapped in an additional group,
                    // add 1 to the requested regex group transparently
                    if (end.regex_pattern)
                    {
                        // dynamicaly-created regex with substistution group as well
                        m = group_replace(end, match[1]/*, 0, 1*/);
                        end = new Matcher(P_SIMPLE, name+'_End', Parser.Grammar.RE(m, end.regex_pattern, {}), T_REGEX);
                    }
                    else
                    {
                        // dynamicaly-created string with substistution group as well
                        m = T_NUM & T ? match[1][end+1] : group_replace(end, match[1]);
                        end = new Matcher(P_SIMPLE, name+'_End', m, m.length>1 ? T_STR : T_CHAR);
                    }
                }
                return end;
            }
        }
        else if (P_COMPOSITE === PT)
        {
            for (i=0,n=pattern.length; i<n; ++i)
            {
                // each one is a matcher in its own
                m = pattern[i].match(stream, eat, any_match);
                if (m) return key ? [i, m[1]] : m;
            }
        }
        else //if (P_SIMPLE === PT)
        {
            type = self.ptype;
            if (T_NULL === type /*|| null === pattern*/)
            {
                // up to end-of-line
                if (false !== eat) stream.end(); // skipToEnd
                return [key, ""];
            }
            else if (T_REGEX === type)
            {
                if (pattern[0] instanceof RE)
                {
                    m = pattern[0].xflags.l ? stream.str.match(pattern[0].re) : stream.str.slice(stream.pos).match(pattern[0].re);
                }
                else
                {
                    m = stream.str.slice(stream.pos).match(pattern[0]);
                }
                if (m && (0 === m.index))
                {
                    if (false !== eat) stream.mov(m[pattern[1]||0].length);
                    return [key, pattern[1] > 0 ? m[pattern[1]] : m];
                }
            }
            else if (T_CHARLIST === type)
            {
                if (true === any_match)
                {
                    m = -1;
                    var mm, cc;
                    for (n=pattern.length-1; n>=0; --n)
                    {
                        mm = stream.str.indexOf(pattern[CHAR](n), stream.pos);
                        if (-1 < mm && (-1 === m || mm < m))
                        {
                            m = mm; cc = pattern[CHAR](n);
                        }
                    }
                    if (-1 < m)
                    {
                        if (false !== eat) stream.pos = m+1;
                        return [key, cc];
                    }
                }
                else
                {
                    m = stream.str[CHAR](stream.pos) || null;
                    if (m && (-1 < pattern.indexOf(m)))
                    {
                        if (false !== eat) stream.mov(1);
                        return [key, m];
                    }
                }
            }
            else if (T_CHAR === type)
            {
                if (true === any_match)
                {
                    m = stream.str.indexOf(pattern, stream.pos);
                    if (-1 < m)
                    {
                        if (false !== eat) stream.pos = m+1;
                        return [key, pattern];
                    }
                }
                else
                {
                    m = stream.str[CHAR](stream.pos) || null;
                    if (pattern === m)
                    {
                        if (false !== eat) stream.mov(1);
                        return [key, m];
                    }
                }
            }
            else if (T_STR === type) // ?? some pattern is undefined !!!!!!!!!
            {
                n = pattern.length;
                if (true === any_match)
                {
                    m = stream.str.indexOf(pattern, stream.pos);
                    if (-1 < m)
                    {
                        if (false !== eat) stream.pos = m+n;
                        return [key, pattern];
                    }
                }
                else
                {
                    if (pattern === stream.str.substr(stream.pos, n))
                    {
                        if (false !== eat) stream.mov(n);
                        return [key, pattern];
                    }
                }
            }
        }
        return false;
    }
};

function Token()
{
    var t = this;
    t.T = 0;
    t.id = null;
    t.type = null;
    t.match = null;
    t.str = '';
    t.pos = null;
    t.block = null;
    t.space = null;
}
Token[PROTO] = {
    constructor: Token

    ,T: null
    ,id: null
    ,type: null
    ,match: null
    ,str: null
    ,pos: null
    ,block: null
    ,space: null

    ,dispose: function() {
        var t = this;
        t.T = null;
        t.id = null;
        t.type = null;
        t.match = null;
        t.str = null;
        t.pos = null;
        t.block = null;
        t.space = null;
        return t;
    }

    ,clone: function() {
        var t = this, tt = new Token();
        tt.T = t.T;
        tt.id = t.id;
        tt.type = t.type;
        tt.match = t.match;
        tt.str = t.str;
        tt.pos = t.pos;
        tt.block = t.block;
        tt.space = t.space;
        return tt;
    }
};

function Result(type, token)
{
    var r = this;
    r.type = type;
    r.token = token instanceof Token  ? token.clone() : (token || null);
    r.data = {};
}
Result[PROTO] = {
    constructor: Result

    ,type: null
    ,token: null
    ,data: null

    ,dispose: function() {
        var r = this;
        r.type = null;
        r.token = null;
        r.data = null;
        return r;
    }
};

function Tokenizer(type, name, token, msg, group, except)
{
    var self = this;
    // common
    self.type = type;
    self.name = name;
    self.token = token;
    self.group = null != group ? group : null;
    self.pos = null;
    self.msg = false === msg ? false : (msg || null);
    self.$msg = null;
    self.status = 0;
    // simple/action
    self.except = except || null;
    self.ci = false;
    self.sep = false;
    // block
    self.empty = false;
    self.mline = true;
    self.esc = false;
    self.inter = false;
    // composite
    self.i0 = 0;
    self.found = 0;
    self.min = 0;
    self.max = 1;
    self.dosep = false;
    self.top = null;
    self.ti = 0;
    self.stk = null;
    self.ast = null;
    self.past = null;
}
Tokenizer[PROTO] = {
    constructor: Tokenizer

    ,type: null
    ,name: null
    ,token: null
    ,group: null
    ,pos: null
    ,msg: null
    ,$msg: null
    ,status: 0

    ,except: null
    ,ci: false
    ,sep: false

    ,empty: false
    ,mline: false
    ,esc: false
    ,inter: false

    ,i0: 0
    ,found: 0
    ,min: 0
    ,max: 1
    ,dosep: false
    ,top: null
    ,ti: 0
    ,stk: null
    ,ast: null
    ,past: null

    ,dispose: function() {
        var self = this;
        // common
        self.type = null;
        self.name = null;
        self.token = null;
        self.group = null;
        self.pos = null;
        self.msg = null;
        self.$msg = null;
        self.status = null;
        // simple
        self.except = null;
        self.ci = null;
        self.sep = null;
        // block
        self.empty = null;
        self.mline = null;
        self.esc = null;
        self.inter = null;
        // composite
        self.i0 = null;
        self.found = null;
        self.min = null;
        self.max = null;
        self.dosep = null;
        self.top = null;
        self.ti = null;
        self.stk = null;
        self.ast = null;
        self.past = null;
        return self;
    }

    ,clone: function(required, group) {
        var t = this,
            tt = new Tokenizer(t.type, t.name, t.token, t.msg, t.group, t.except);

        tt.ci = t.ci;
        tt.sep = t.sep;

        tt.empty = t.empty;
        tt.mline = t.mline;
        tt.esc = t.esc;
        tt.inter = t.inter;

        tt.i0 = t.i0;
        tt.found = t.found;
        tt.min = t.min;
        tt.max = t.max;
        tt.dosep = t.dosep;
        tt.top = t.top;
        tt.ti = t.ti;
        tt.stk = t.stk;
        tt.ast = t.ast;
        tt.past = t.past;

        if (required) tt.status |= REQUIRED;
        if (T_STR&get_type(group)) tt.group = group;

        return tt;
    }

    ,err: function() {
        var t = this, T = t.name;
        return t.$msg
            ? t.$msg
            : (
                t.status & REQUIRED
                ? 'Token "'+T+'" Expected'
                : 'Syntax Error: "'+T+'"'
            );
    }

    ,tokenize: function(stream, state, token, options) {
        //if ( !t ) return false;
        var t = this, T = t.type;
        if (T_COMPOSITE & T) return t.composite(stream, state, token, options);
        else if (T_BLOCK & T) return t.block(stream, state, token, options);
        else if (T_ACTION & T) return t.action(stream, state, token, options);
        return t.simple(stream, state, token, options);
    }

    ,action: function(stream, state, token, options) {
        var self = this, action_def = self.token || null,
        action, case_insensitive = self.ci, aid = self.name,
        t, t0, ns, msg, queu, symb, found, raw = false,
        l1, c1, l2, c2, in_ctx, in_hctx, err, t_str, is_block,
        options, hash, list, no_state_errors = !(state.status & ERRORS);

        self.status = 0; self.$msg = null;

        // do action only if state.status handles (action) errors, else dont clutter
        if (/*no_state_errors ||*/ !action_def || !token || !token.pos) return new Parser.Result(true);
        is_block = !!(T_BLOCK & token.T);
        // NOP action, return OR partial block not completed yet, postpone
        if (A_NOP === action_def[0] || (is_block && !token.block)) return new Parser.Result(true);

        action = action_def[0]; t = action_def[1];
        options = action_def[2] || {}; msg = self.msg;
        in_ctx = options['in-context']; in_hctx = options['in-hypercontext'];

        if (is_block /*&& token.block*/)
        {
            t_str = token.block.match || token.block.str;
            l1 = token.block.pos[0][0];     c1 = token.block.pos[0][1];
            l2 = token.block.pos[0][3];     c2 = token.block.pos[0][4];
        }
        else
        {
            t_str = token.match || token.str;
            l1 = token.pos[0];              c1 = token.pos[1];
            l2 = token.pos[3];              c2 = token.pos[4];
        }

        if (A_CTXEND === action)
        {
            state.ctx = state.ctx ? state.ctx.prev : null;
        }

        else if (A_CTXSTART === action)
        {
            state.ctx = new Parser.Stack({tabl:{},symb:null,queu:null,prec:0,assoc:0}, state.ctx);
        }

        else if (A_HYPCTXEND === action)
        {
            state.hctx = state.hctx ? state.hctx.prev : null;
        }

        else if (A_HYPCTXSTART === action)
        {
            state.hctx = new Parser.Stack({tabl:{},symb:null,queu:null,prec:0,assoc:0}, state.hctx);
        }

        else if (A_PRECEDE === action || A_ASSOCIAT === action)
        {
            if (in_hctx)
            {
                if (A_ASSOCIAT === action) state.hctx.val.assoc = t;
                else state.hctx.val.prec = t;
            }
            else if (in_ctx)
            {
                if (A_ASSOCIAT === action) state.ctx.val.assoc = t;
                else state.ctx.val.prec = t;
            }
            else
            {
                if (A_ASSOCIAT === action) state.assoc = t;
                else state.prec = t;
            }
        }
        else if (A_DEFINE === action)
        {
            hash = "hash" === options.mode;
            list = hash ? "tabl" : "symb";
            t0 = t[1]; ns = t[0];
            t0 = group_replace(t0, t_str, raw);
            if (case_insensitive) t0 = t0[LOWER]();
            ns += '::'+t0;
            if (in_hctx && state.hctx)
            {
                found = Parser.Stack.findKey(state.hctx.val[list], ns, hash);
            }
            else if (in_ctx && state.ctx)
            {
                found = Parser.Stack.findKey(state.ctx.val[list], ns, hash);
            }
            else if (state.symb)
            {
                found = Parser.Stack.findKey(state[list], ns, hash);
            }
            else
            {
                found = null;
            }
            if (!found)
            {
                if (in_hctx && state.hctx)
                {
                    state.hctx.val[list] = Parser.Stack.addKey(state.hctx.val[list], ns, [l1, c1, l2, c2, ns, t0, token.type, !!options.autocomplete, case_insensitive], hash);
                }
                else if (in_ctx && state.ctx)
                {
                    state.ctx.val.symb = Parser.Stack.addKey(state.ctx.val.symb, ns, [l1, c1, l2, c2, ns, t0, token.type, !!options.autocomplete, case_insensitive], hash);
                }
                else
                {
                    state.symb = Parser.Stack.addKey(state.symb, ns, [l1, c1, l2, c2, ns, t0, token.type, !!options.autocomplete, case_insensitive], hash);
                }
            }
        }

        else if (A_UNDEFINE === action)
        {
            hash = "hash" === options.mode;
            list = hash ? "tabl" : "symb";
            t0 = t[1]; ns = t[0];
            t0 = group_replace(t0, t_str, raw);
            if (case_insensitive) t0 = t0[LOWER]();
            ns += '::'+t0;
            if (in_hctx && state.hctx)
            {
                found = Parser.Stack.findKey(state.hctx.val[list], ns, hash);
            }
            else if (in_ctx && state.ctx)
            {
                found = Parser.Stack.findKey(state.ctx.val[list], ns, hash);
            }
            else if (state[list])
            {
                found = Parser.Stack.findKey(state[list], ns, hash);
            }
            else
            {
                return new Parser.Result(true);
            }
            if (found)
            {
                if (in_hctx && state.hctx)
                    state.hctx.val[list] = Parser.Stack.delKey(found, hash);
                else if (in_ctx && state.ctx)
                    state.ctx.val[list] = Parser.Stack.delKey(found, hash);
                else
                    state[list] = Parser.Stack.delKey(found, hash);
            }
        }

        else if (A_DEFINED === action || A_NOTDEFINED === action)
        {
            hash = "hash" === options.mode;
            list = hash ? "tabl" : "symb";
            t0 = t[1]; ns = t[0];
            t0 = group_replace(t0, t_str, raw);
            if (case_insensitive) t0 = t0[LOWER]();
            ns += '::'+t0;
            if (in_hctx && state.hctx)
            {
                found = Parser.Stack.findKey(state.hctx.val[list], ns, hash);
            }
            else if (in_ctx && state.ctx)
            {
                found = Parser.Stack.findKey(state.ctx.val[list], ns, hash);
            }
            else if (state.symb)
            {
                found = Parser.Stack.findKey(state[list], ns, hash);
            }
            else
            {
                found = null;
            }
            if (!found)
            {
                // undefined
                if (A_NOTDEFINED === action)
                {
                    return new Parser.Result(true);
                }
                else
                {
                    if (false !== msg)
                    {
                        self.$msg = msg
                            ? group_replace(msg, t0, true)
                            : ('Undefined "'+t0+'"');
                        err = self.err();
                        state.error(l1, c1, l2, c2, self, err);
                        self.status |= ERROR;
                    }
                    return new Parser.Result(false);
                }
            }
            else if (A_NOTDEFINED === action)
            {
                // defined
                if (false !== msg)
                {
                    self.$msg = msg
                        ? group_replace(msg, t0, true)
                        : ('Defined "'+t0+'"');
                    err = self.err();
                    state.error(found.val[0], found.val[1], found.val[2], found.val[3], self, err);
                    state.error(l1, c1, l2, c2, self, err);
                    self.status |= ERROR;
                }
                return new Parser.Result(false);
            }
            else
            {
                return new Parser.Result(true);
            }
        }

        // above actions can run during live editing as well
        if (no_state_errors) return new Parser.Result(true);

        if (A_ERROR === action)
        {
            if (!msg && (T_STR & get_type(t))) msg = t;
            self.$msg = msg ? group_replace(msg, t_str, true) : ('Error "' + aid + '"');
            state.error(l1, c1, l2, c2, self, self.err());
            self.status |= ERROR;
            return new Parser.Result(false);
        }

        else if (A_UNIQUE === action)
        {
            hash = "hash" === options.mode;
            list = hash ? "tabl" : "symb";
            if (in_hctx)
            {
                if (state.hctx) symb = state.hctx.val[list];
                else return new Parser.Result(true);
            }
            else if (in_ctx)
            {
                if (state.ctx) symb = state.ctx.val[list];
                else return new Parser.Result(true);
            }
            else
            {
                symb = state[list];
            }
            t0 = t[1]; ns = t[0];
            t0 = group_replace(t0, t_str, raw);
            if (case_insensitive) t0 = t0[LOWER]();
            ns += '::'+t0; found = Parser.Stack.findKey(symb, ns, hash);
            if (found)
            {
                // duplicate
                if (false !== msg)
                {
                    self.$msg = msg
                        ? group_replace(msg, t0, true)
                        : ('Duplicate "'+t0+'"');
                    err = self.err();
                    state.error(found.val[0], found.val[1], found.val[2], found.val[3], self, err);
                    state.error(l1, c1, l2, c2, self, err);
                    self.status |= ERROR;
                }
                return new Parser.Result(false);
            }
            else
            {
                if (in_hctx)
                {
                    state.hctx.val[list] = Parser.Stack.addKey(state.hctx.val[list], ns, [l1, c1, l2, c2, ns, t0, token.type, !!options.autocomplete, case_insensitive], hash);
                }
                else if (in_ctx)
                {
                    state.ctx.val[list] = Parser.Stack.addKey(state.ctx.val[list], ns, [l1, c1, l2, c2, ns, t0, token.type, !!options.autocomplete, case_insensitive], hash);
                }
                else
                {
                    state[list] = Parser.Stack.addKey(state.symb, ns, [l1, c1, l2, c2, ns, t0, token.type, !!options.autocomplete, case_insensitive], hash);
                }
            }
        }

        else if (A_MCHEND === action)
        {
            if (in_hctx)
            {
                if (state.hctx) queu = state.hctx.val.queu;
                else return new Parser.Result(true);
            }
            else if (in_ctx)
            {
                if (state.ctx) queu = state.ctx.val.queu;
                else return new Parser.Result(true);
            }
            else
            {
                queu = state.queu;
            }
            if (t)
            {
                t = group_replace(t, t_str, raw);
                if (case_insensitive) t = t[LOWER]();
                if (!queu || t !== queu.val[0])
                {
                    // no match
                    if (false !== msg)
                    {
                        if (queu)
                        {
                            self.$msg = msg
                                ? group_replace(msg, [queu.val[0],t], true)
                                : ('Mismatched "'+queu.val[0]+'","'+t+'"');
                            err = self.err();
                            state.error(queu.val[1], queu.val[2], queu.val[3], queu.val[4], self, err);
                            state.error(l1, c1, l2, c2, self, err);
                            queu = queu.prev;
                        }
                        else
                        {
                            self.$msg = msg
                                ? group_replace(msg, ['',t], true)
                                : ('Missing matching "'+t+'"');
                            err = self.err();
                            state.error(l1, c1, l2, c2, self, err);
                        }
                        self.status |= ERROR;
                    }
                    if (in_hctx)
                    {
                        if (state.hctx) state.hctx.val.queu = queu;
                    }
                    else if (in_ctx)
                    {
                        if (state.ctx) state.ctx.val.queu = queu;
                    }
                    else
                    {
                        state.queu = queu;
                    }
                    return new Parser.Result(false);
                }
                else
                {
                    queu = queu ? queu.prev : null;
                }
            }
            else
            {
                // pop unconditionaly
                queu = queu ? queu.prev : null;
            }
            if (in_hctx)
            {
                if (state.hctx) state.hctx.val.queu = queu;
            }
            else if (in_ctx)
            {
                if (state.ctx) state.ctx.val.queu = queu;
            }
            else
            {
                state.queu = queu;
            }
        }

        else if ((A_MCHSTART === action) && t)
        {
            if (in_hctx)
            {
                if (state.hctx) queu = state.hctx.val.queu;
                else return new Parser.Result(true);
            }
            else if (in_ctx)
            {
                if (state.ctx) queu = state.ctx.val.queu;
                else return new Parser.Result(true);
            }
            else
            {
                queu = state.queu;
            }
            t = group_replace(t, t_str, raw);
            if (case_insensitive) t = t[LOWER]();
            self.$msg = msg
                ? group_replace(msg, t, true)
                : ('Missing matching "'+t+'"');
            // used when end-of-file is reached and unmatched tokens exist in the queue
            // to generate error message, if needed, as needed
            queu = new Parser.Stack([t, l1, c1, l2, c2, self.err()], queu);
            if (in_hctx)
            {
                if (state.hctx) state.hctx.val.queu = queu;
            }
            else if (in_ctx)
            {
                if (state.ctx) state.ctx.val.queu = queu;
            }
            else
            {
                state.queu = queu;
            }
        }
        return new Parser.Result(true);
    }

    ,simple: function(stream, state, token, options, exception) {
        var self = this, pattern = self.token,
            type = self.type, tokenID = self.name,
            group = '' === self.group ? self.group : (self.group || tokenID),
            except = self.except, tok_except, state_ast, ast_part = null,
            backup, line = stream.line, pos = stream.pos,
            i, l, m = null, ret = false;

        self.status &= CLEAR_ERROR;
        self.$msg = exception ? null : (self.msg || null);
        self.pos = stream.pos;
        state_ast = state.ast;
        if (except && !exception)
        {
            backup = state.backup(stream);
            for(i=0,l=except.length; i<l; ++i)
            {
                state.ast = {}; tok_except = except[i];
                // exceptions are ONLY simple tokens
                if ((self === tok_except) || (T_SIMPLE !== tok_except.type) || (pattern === tok_except.token)) continue;
                // exception matched, backup and fail
                if (false !== tok_except.simple(stream, state, token, options, 1).type) {self.pos = tok_except.pos; state.backup(stream, backup); return new Parser.Result(false);}
            }
            state.ast = state_ast;
        }
        // match SOF (start-of-file, first line of source)
        if (T_SOF === type) {ret = (0 === stream.line);}
        // match FNBL (first non-blank line of source)
        else if (T_FNBL === type) {ret = (state.bline+1 === stream.line);}
        // match SOL (start-of-line)
        else if (T_SOL === type) {ret = stream.sol();}
        // match EOL (end-of-line) (with possible leading spaces)
        else if (T_EOL === type)
        {
            stream.spc();
            if (stream.eol()) ret = true/*tokenID*/;
            else {self.pos = stream.pos; stream.bck(pos);}
        }
        // match EMPTY token
        else if (T_EMPTY === type) {self.status = 0; ret = true;}
        // match non-space
        else if (T_NONSPACE === type)
        {
            if ((null != token.space) && !stream.eol())
            {
                // space is already parsed, take it into account here
                if (self.status & REQUIRED) self.status |= ERROR;
            }
            else if (stream.spc() && !stream.eol())
            {
                self.pos = stream.pos;
                stream.bck(pos);
                if (self.status & REQUIRED) self.status |= ERROR;
            }
            else
            {
                ret = true;
            }
            self.status &= CLEAR_REQUIRED;
            if (true === ret) return new Parser.Result(ret);
        }
        // match up to end-of-line
        else if (T_NULL === pattern)
        {
            stream.end(); // skipToEnd
            ret = group;
        }
        // else match a simple token
        else if (m = pattern.match(stream))
        {
            m = m[1];
            ret = group;
        }
        if (exception) return new Parser.Result(ret);
        if (false !== ret)
        {
            token.T = type; token.id = tokenID; token.type = ret;
            token.str = stream.sel(pos, stream.pos); token.match = m;
            token.pos = [line, pos, stream.ind(pos), line, stream.pos, stream.ind(stream.pos)];
            if ((true!==ret) && group.length)
            {
                ast_part = {terminal:true, token:token.str, match:null==m ? token.str : (T_STR&get_type(m) ? m : (m[2]||m[1]||m[0]||token.str)), from:{line:token.pos[0], pos:token.pos[1], index:token.pos[2]}, to:{line:token.pos[3], pos:token.pos[4], index:token.pos[5]}};

                // handle multiple parts with same name
                if (HAS.call(state.ast, group))
                {
                    if (T_ARRAY !== get_type(state.ast[group])) state.ast[group] = [state.ast[group]];
                    state.ast[group].push(ast_part);
                }
                else
                {
                    state.ast[group] = ast_part;
                }
            }
        }
        if (!ret && self.status && self.$msg) self.$msg = group_replace(self.$msg, tokenID, true);
        return new Parser.Result(ret, token);
    }

    ,block: function(stream, state, token, options) {
        var self = this, block = self.name, type = self.type,
            group = ''===self.group ? self.group : (self.group || block),
            block_start = self.token, block_end, state_ast,
            is_multiline = self.mline, has_interior = false,
            block_interior = /*has_interior ? block+'.inside' :*/ block,
            esc_char = self.esc, is_escaped = !!esc_char, is_eol,
            already_inside, found, ended, continued, continue_to_next_line,
            block_start_pos, block_end_pos, block_inside_pos,
            b_start = '', b_inside = '', b_inside_rest = '', b_end = '', b_block,
            char_escaped, next, ret, is_required, $id = block, can_be_empty,
            stream_pos, stream_pos0, stack_pos, line, pos, matched, ast_part = null,
            outer = state.outer, outerState = outer && outer[2], outerTokenizer = outer && outer[1]
        ;

        /*
            This tokenizer class handles many different block types (BLOCK, COMMENT, ESC_BLOCK, SINGLE_LINE_BLOCK),
            having different styles (DIFFERENT BLOCK DELIMS/INTERIOR) etc..
            So logic can become somewhat complex,
            descriptive names and logic used here for clarity as far as possible
        */

        self.status &= CLEAR_ERROR;
        self.$msg = self.msg || null;
        self.pos = stream.pos;
        line = stream.line; pos = stream.pos;
        // comments are not required tokens
        if (T_COMMENT === type) self.status &= CLEAR_REQUIRED;

        is_required = self.status & REQUIRED; already_inside = 0; found = 0;

        if (state.block && (state.block.name === block))
        {
            found = 1; already_inside = 1; ret = block_interior;
            block_end = state.block.end;
            block_start_pos = state.block.sp; block_inside_pos = state.block.ip;  block_end_pos = state.block.ep;
            b_start = state.block.s;  b_inside = state.block.i;
        }
        else if (!state.block && (block_end = block_start.match(stream)))
        {
            found = 1; ret = block;
            stream_pos = stream.pos;
            block_start_pos = [line, pos, stream.ind(pos)];
            block_inside_pos = [[line, stream_pos, stream.ind(stream_pos)], [line, stream_pos, stream.ind(stream_pos)]]; block_end_pos = [line, stream_pos, stream.ind(stream_pos)];
            b_start = stream.sel(pos, stream_pos);  b_inside = '';  b_end = '';
            state.block = {
                name: block,  end: block_end,
                sp: block_start_pos, ip: block_inside_pos, ep: block_end_pos,
                s: b_start, i: b_inside, e: b_end
            };
        }

        if (found)
        {
            stack_pos = state.stack;
            is_eol = T_NULL === block_end.ptype;
            can_be_empty = is_eol || self.empty;

            if (has_interior)
            {
                if (is_eol && already_inside && stream.sol())
                {
                    // eol block continued to start of next line, abort
                    self.status &= CLEAR_REQUIRED;
                    state.block = null;
                    return new Parser.Result(false);
                }

                if (!already_inside)
                {
                    stream_pos = stream.pos;
                    token.T = type; token.id = block; token.type = group;
                    token.str = stream.sel(pos, stream_pos); token.match = null;
                    token.pos = [line, pos, stream.ind(pos), line, stream_pos, stream.ind(stream_pos)];
                    // not push this directly, instead let wrapper seq handle it
                    //state.pushAt( stack_pos, self.clone( is_required ) );
                    return new Parser.Result(group, token);
                }
            }

            stream_pos = stream.pos;
            ended = outerTokenizer ? is_eol && stream.eol() : block_end.match(stream);
            continue_to_next_line = is_multiline;
            continued = 0;

            if (!ended)
            {
                stream_pos0 = stream.pos;
                char_escaped = false;
                if (outerTokenizer || is_escaped ||
                    (T_CHARLIST !== block_end.ptype && T_CHAR !== block_end.ptype && T_STR !== block_end.ptype)
                )
                {
                    while (!stream.eol())
                    {
                        // check for outer parser interleaved
                        if (outerTokenizer)
                        {
                            if (false !== outerTokenizer.tokenize(stream, outerState, token, options).type)
                            {
                                if (stream.pos > stream_pos0)
                                {
                                    // return any part of current block first
                                    if (is_eol) ended = 1;
                                    break;
                                }
                                else
                                {
                                    // dispatch back to outer parser (interleaved next)
                                    return new Parser.Result(true);
                                }
                            }
                            else if (is_eol)
                            {
                                // EOL block, go char-by-char since outerToken might still be inside
                                next = stream.nxt(1);
                                b_inside_rest += next;
                                continue;
                            }
                        }
                        stream_pos = stream.pos;
                        if (!char_escaped && block_end.match(stream))
                        {
                            if (has_interior)
                            {
                                if (stream.pos > stream_pos && stream_pos > stream_pos0)
                                {
                                    ret = block_interior;
                                    stream.bck(stream_pos);
                                    continued = 1;
                                }
                                else
                                {
                                    ret = block;
                                    ended = 1;
                                }
                            }
                            else
                            {
                                ret = block;
                                ended = 1;
                            }
                            b_end = stream.sel(stream_pos, stream.pos);
                            break;
                        }
                        else
                        {
                            next = stream.nxt(1);
                            b_inside_rest += next;
                        }
                        char_escaped = is_escaped && !char_escaped && (esc_char === next);
                        stream_pos = stream.pos;
                    }
                    if (is_eol && stream.eol()) ended = 1;
                }
                else
                {
                    // non-escaped block,
                    // match at once instead of char-by-char
                    if (matched = block_end.match(stream, true, true))
                    {
                        if (has_interior)
                        {
                            if (stream.pos > stream_pos+matched[1].length)
                            {
                                ret = block_interior;
                                stream.mov(-matched[1].length);
                                continued = 1;
                                b_inside_rest = stream.sel(stream_pos, stream.pos);
                            }
                            else
                            {
                                ret = block;
                                ended = 1;
                                b_inside_rest = stream.sel(stream_pos, stream.pos-matched[1].length);
                                b_end = matched[1];
                            }
                        }
                        else
                        {
                            ret = block;
                            ended = 1;
                            b_inside_rest = stream.sel(stream_pos, stream.pos-matched[1].length);
                            b_end = matched[1];
                        }
                    }
                    else
                    {
                        // skip to end of line, and continue
                        stream.end();
                        ret = block_interior;
                        continued = 1;
                        b_inside_rest = stream.sel(stream_pos, stream.pos);
                    }
                }
            }
            else
            {
                ret = is_eol ? block_interior : block;
                b_end = stream.sel(stream_pos, stream.pos);
            }
            continue_to_next_line = is_multiline || (is_escaped && char_escaped);

            b_inside += b_inside_rest;
            block_inside_pos[1] = [line, stream_pos, stream.ind(stream_pos)]; block_end_pos = [line, stream.pos, stream.ind(stream.pos)];

            if (ended)
            {
                // block is empty, invalid block
                if (!can_be_empty &&
                    (block_inside_pos[0][0] === block_inside_pos[1][0]) &&
                    (block_inside_pos[0][1] === block_inside_pos[1][1])
                )
                {
                    state.block = null;
                    return new Parser.Result(false);
                }
            }

            if (ended || (!continue_to_next_line && !continued))
            {
                state.block = null;
            }
            else
            {
                state.block.ip = block_inside_pos;  state.block.ep = block_end_pos;
                state.block.i = b_inside; state.block.e = b_end;
                // not push this directly, instead let wrapper seq handle it
                //state.pushAt(stack_pos, self.clone(is_required));
            }
            token.T = type; token.id = block; token.type = group || ret;
            token.str = stream.sel(pos, stream.pos); token.match = null;
            token.pos = [line, pos, stream.ind(pos), block_end_pos[0], block_end_pos[1], block_end_pos[2]];
            self.pos = stream.pos;

            if (!state.block)
            {
                // block is now completed
                b_block = b_start + b_inside + b_end;
                token.block = {
                str: b_block,
                match: [b_block, b_inside, b_start, b_end],
                part: [b_block, b_start, b_inside, b_end],
                pos: [
                    [block_start_pos[0], block_start_pos[1], block_start_pos[2], block_end_pos[0], block_end_pos[1], block_end_pos[2]],
                    [block_start_pos[0], block_start_pos[1], block_start_pos[2], block_inside_pos[0][0], block_inside_pos[0][1], block_inside_pos[0][2]],
                    [block_inside_pos[0][0], block_inside_pos[0][1], block_inside_pos[0][2], block_inside_pos[1][0], block_inside_pos[1][1], block_inside_pos[1][2]],
                    [block_inside_pos[1][0], block_inside_pos[1][1], block_inside_pos[1][2], block_end_pos[0], block_end_pos[1], block_end_pos[2]]
                ]
                };
                if ((true!==ret) && group.length)
                {
                    ast_part = {terminal:true, token:token.block.str, match:b_inside, from:{line:block_start_pos[0], pos:block_start_pos[1], index:block_start_pos[2]}, to:{line:block_end_pos[0], pos:block_end_pos[1], index:block_end_pos[2]}};

                    // handle multiple parts with same name
                    if (HAS.call(state.ast, group))
                    {
                        if (T_ARRAY !== get_type(state.ast[group])) state.ast[group] = [state.ast[group]];
                        state.ast[group].push(ast_part);
                    }
                    else
                    {
                        state.ast[group] = ast_part;
                    }
                }
            }
            return new Parser.Result(group, token);
        }
        if (self.status && self.$msg) self.$msg = group_replace(self.$msg, block, true);
        return new Parser.Result(false);
    }

    ,composite: function(stream, state, token, options) {
        var self = this, type = self.type,
            name = self.name, group = self.group, groupname,
            tokens = self.token, n = tokens.length, token_izer, action,
            ret_t, ret_a, found, min, max, pos, spos,
            tokens_required, tokens_err, stream_pos, stack_pos,
            i, j, i0, tt, err, backup, ast, state_ast, subgrammar, nextTokenizer;

        self.status &= CLEAR_ERROR;
        self.$msg = self.msg || null;

        stream_pos = stream.pos;
        stack_pos = state.stack;
        self.pos = stream.pos;
        state_ast = state.ast;

        tokens_required = 0; tokens_err = 0;
        groupname = ''===group ? group : (group || name);

        if (T_SUBGRAMMAR === type)
        {
            subgrammar = new Parser.Result(tokens[0]);
            nextTokenizer = state.stack ? state.stack.val : null;
            subgrammar.data.subgrammar = true;
            subgrammar.data.name = name;
            subgrammar.data.group = group;
            subgrammar.data.next = nextTokenizer ? new Parser.Tokenizer(T_POSITIVE_LOOKAHEAD, nextTokenizer.name, [nextTokenizer.clone()]) : null;
            subgrammar.data.required = nextTokenizer ? nextTokenizer.status & REQUIRED : 0;
            // return the subgrammar id to continue parsing with the subgrammar (if exists)
            return subgrammar;
        }

        else if (T_LOOKAHEAD & type)
        {
            // not supported, return success as default
            if (T_SUBGRAMMAR & tokens[0].type) return new Parser.Result(true);
            backup = state.backup(stream, null, false); state.ast = {};
            ret_t = tokens[0].clone().tokenize(stream, state, token);
            state.backup(stream, backup);
            return new Parser.Result(T_NEGATIVE_LOOKAHEAD === type ? (false === ret_t.type) : (false !== ret_t.type));
        }

        else if (T_ALTERNATION === type)
        {
            self.status = /*self.top ? (self.top & REQUIRED) :*/ REQUIRED;
            err = [];
            i0 = self.i0 || 0;
            self.i0 = 0; // reset
            if (n <= i0)
            {
                state_ast = self.past;
                // if it is top rule add it by name if needed
                state_ast[group && group.length ? group : name] = state.ast;
                state.ast = state_ast;
                return new Parser.Result(true);
            }
            if (!self.top)
            {
                self.past = state.ast;
                state.ast = {};
            }
            backup = state.backup(stream);
            state_ast = merge({}, state.ast); // shallow copy
            for (i=i0; i<n; ++i)
            {
                token_izer = tokens[i].clone(self.status, group);
                token_izer.top = self;
                token_izer.ti = i;
                token_izer.stk = stack_pos;
                token_izer.dosep = self.dosep;
                ret_t = token_izer.tokenize(stream, state, token, options);
                self.pos = token_izer.pos;
                pos = stream.pos;

                if (token_izer.status & REQUIRED)
                {
                    ++tokens_required;
                    err.push(token_izer.err());
                }

                if (false !== ret_t.type)
                {
                    backup[3] = self.top ? self.stk : stack_pos;
                    backup[9] = state_ast;
                    found = 0;
                    spos = state.stack;
                    state_ast = state.ast;
                    while (++i < n)
                    {
                        stream.bck(stream_pos);
                        state.stack = null;
                        state.ast = {};
                        token_izer = tokens[i].clone();
                        token_izer.dosep = self.dosep;
                        ret_a = token_izer.tokenize(stream, state, token, options);
                        if (false !== ret_a.type)
                        {
                            i0 = i;
                            ++found;
                            break;
                        }
                    }
                    stream.pos = pos;
                    state.stack = spos;
                    state.ast = state_ast;
                    if (0 < found)
                    {
                        // push alternative, if further down it fails
                        if (self.top)
                        {
                            token_izer = self.top.clone();
                            token_izer.token = token_izer.token.slice();
                            token_izer.token[self.ti] = self.clone();
                            token_izer.token[self.ti].top = null;
                            token_izer.token[self.ti].i0 = i0;
                            token_izer.i0 = self.ti;
                        }
                        else
                        {
                            token_izer = self.clone();
                            token_izer.i0 = i0;
                        }
                        state.alt = new Parser.Stack({
                            tokenizer: token_izer,
                            state: backup
                        }, state.alt);
                    }
                    if (!self.top)
                    {
                        // push to pack ast if is top rule
                        token_izer = self.clone();
                        token_izer.i0 = n;
                        state.pushAt(stack_pos, token_izer);
                        self.past = null;
                    }
                    return ret_t;
                }
                if (token_izer.status & ERROR)
                {
                    ++tokens_err;
                }
                state.backup(stream, backup);
            }

            if (tokens_required > 0) self.status |= REQUIRED;
            else self.status &= CLEAR_REQUIRED;
            if ((n === i0+tokens_err) && (tokens_required > 0)) self.status |= ERROR;
            else self.status &= CLEAR_ERROR;
            if (self.status && !self.$msg && err.length) self.$msg = err.join(' | ');
            return new Parser.Result(false);
        }

        else if (T_SEQUENCE === type)
        {
            self.status = /*self.top ? (self.top & REQUIRED) :*/ REQUIRED;
            i0 = self.i0 || 0;
            self.i0 = 0; // reset
            backup = state.backup(stream);
            if (0 === i0)
            {
                state_ast = state.ast;
                state.ast = {};
            }
            else if (n <= i0)
            {
                state_ast = self.past;
                if (!self.top)
                {
                    // if it is top rule add it by name if needed
                    state_ast[group && group.length ? group : name] = state.ast;
                }
                else if (group && group.length)
                {
                    //if (KEYS(state.ast).length)
                        state_ast[group] = state.ast;
                }
                else
                {
                    state_ast = merge(state_ast, state.ast);
                }
                state.ast = state_ast;
                return new Parser.Result(true);
            }
            else
            {
                state_ast = self.past;
            }
            ret_t = new Parser.Result(false);

            // if EOL is left on stack previously and SOL, bypass
            if (0<i0 && i0<n && (T_EOL === tokens[i0].type) && stream.sol()) ++i0;
            // if list separator is optionally first, bypass
            if (0===i0 && tokens[i0].sep && !self.dosep) ++i0;
            while (i0 < n)
            {
                token_izer = tokens[i0].clone(self.status);
                tokens[i0].i0 = 0; // reset if coming from alternative backup
                token_izer.top = self;
                token_izer.ti = i0;
                token_izer.stk = stack_pos;
                ret_t = token_izer.tokenize(stream, state, token, options);
                ++i0;
                // bypass failed but optional tokens in the sequence
                // or successful lookahead tokens
                // and get to the next ones
                if (!(
                    ((true === ret_t.type) && (T_LOOKAHEAD & token_izer.type)) ||
                    ((false === ret_t.type) && !(token_izer.status & REQUIRED))
                )) break;
            }

            self.pos = token_izer.pos;
            action = null;

            // action token(s) follow, execute action(s) on current token
            while ((false !== ret_t.type) && !state.block && (i0<n) && (T_ACTION === tokens[i0].type))
            {
                action = tokens[i0++].clone(1);
                ret_a = action.action(stream, state, token, options);
                // action error
                if (action.status & ERROR)
                {
                    ret_t = new Parser.Result(false);
                    break;
                }
            }

            // not required, left over from loop that finished above, ignore
            if ((false === ret_t.type) && (!token_izer || !(token_izer.status & REQUIRED))) self.status &= CLEAR_REQUIRED;

            // check for non-space tokenizer before passing on to consume space/empty
            if ((false !== ret_t.type) && (i0<n) && !state.block && (T_NONSPACE === tokens[i0].type))
            {
                tt = tokens[i0++].clone(self.status);
                ret_a = tt.tokenize(stream, state, token, options);
                if ((false === ret_a.type) && (tt.status & REQUIRED))
                {
                    ret_t = new Parser.Result(false);
                    self.status |= ERROR;
                    if (!self.$msg) self.$msg = tt.err();
                }
            }

            if (false !== ret_t.type)
            {
                token_izer = self.clone();
                token_izer.i0 = state.block ? i0-1 : (i0 < n ? i0 : n);
                token_izer.past = state_ast;
                state.pushAt(stack_pos, token_izer);
                if (ret_t.data.subgrammar && (i0 < n))
                {
                    // add the nextTokenizer to subgrammar token, from here
                    ret_t.data.next = new Parser.Tokenizer(T_POSITIVE_LOOKAHEAD, tokens[i0].name, [tokens[i0].clone()]);
                    ret_t.data.required = tokens[i0].status & self.status;
                }
                return ret_t;
            }
            else if ((token_izer.status & REQUIRED) || (action && (action.status & ERROR)))
            {
                self.status |= ERROR;
            }
            if (self.status)
            {
                state.backup(stream, backup);
                // include partial ast so far (better??)
                if (options && options.ignoreErrors)
                {
                    if (group && group.length)
                    {
                        if (KEYS(state.ast).length)
                            state_ast[group] = state.ast;
                    }
                    else
                    {
                        state_ast = merge(state_ast, state.ast);
                    }
                }
                state.ast = state_ast;
                if (!self.$msg) self.$msg = (action || token_izer).err();
            }
            return new Parser.Result(false);
        }

        else //if ( T_REPEATED & type )
        {
            found = self.found; min = self.min; max = self.max;
            self.status = found < min ? REQUIRED : 0;
            err = [];

            backup = state.backup(stream);
            if (self.ast)
            {
                state_ast = self.past;
                ast = self.ast;
                if (KEYS(state.ast).length)
                    ast.push(state.ast);
            }
            else
            {
                state_ast = state.ast;
                ast = [];
            }

            if (found >= max)
            {
                if (groupname.length /*&& ast.length*/)
                {
                    if (1 === max)
                    {
                        if (ast.length)
                        {
                            if (group && group.length)
                                state_ast[group] = ast[0];
                            else
                                state_ast = merge(state_ast, ast[0]);
                        }
                    }
                    else
                    {
                        state_ast[groupname] = ast;
                    }
                }
                state.ast = state_ast;
                self.status = 0;
                return new Parser.Result(true);
            }

            for (i=0; i<n; ++i)
            {
                state.ast = {};
                token_izer = tokens[i].clone(self.status);
                tokens[i].i0 = 0; // reset if coming from alternative backup
                token_izer.top = self;
                token_izer.ti = i;
                token_izer.stk = stack_pos;
                token_izer.dosep = 0<found;
                ret_t = token_izer.tokenize(stream, state, token, options);
                self.pos = token_izer.pos;

                if (false !== ret_t.type)
                {
                    ++found;
                    if (found <= max)
                    {
                        // push it to the stack for more
                        self.found = found;
                        token_izer = self.clone();
                        token_izer.ast = ast;
                        token_izer.past = state_ast;
                        state.pushAt(stack_pos, token_izer);
                        self.found = 0;
                    }
                    return ret_t;
                }
                else if (token_izer.status & REQUIRED)
                {
                    ++tokens_required;
                    err.push(token_izer.err());
                }
                state.backup(stream, backup);
            }

            if (found < min) self.status |= REQUIRED;
            if ((found > max) || ((found < min) && (0 < tokens_required))) self.status |= ERROR;
            if (self.status && !self.$msg && err.length) self.$msg = err.join(' | ');
            if ((min <= found) && (found <= max) && (0 < found))
            {
                if (groupname.length /*&& ast.length*/)
                {
                    if (1 === max)
                    {
                        if (ast.length)
                        {
                            if (group && group.length)
                                state_ast[group] = ast[0];
                            else
                                state_ast = merge(state_ast, ast[0]);
                        }
                    }
                    else
                    {
                        state_ast[groupname] = ast;
                    }
                }
            }
            state.ast = state_ast;
            return new Parser.Result(false);
        }
    }
};

function Stack(val, prev/*, next*/)
{
    var self = this;
    self.val = val || null;
    self.prev = prev ? prev : null;
}
Stack[PROTO] = {
    constructor: Stack
    ,val: null
    ,prev: null

    ,clone: function(deep) {
        var stack = this;
        if (null == stack) return null;
        if (deep)
        {
            var stack2 = new Stack(stack.val), ptr2 = stack2, ptr = stack;
            while (ptr.prev)
            {
                ptr2.prev = new Stack(ptr.prev.val);
                ptr = ptr.prev; ptr2 = ptr2.prev;
            }
            return stack2;
        }
        else
        {
            return stack;
        }
    }
};
Stack.findKey = function(list, key, hash) {
    var match = null;
    if (hash)
    {
        if (list && HAS.call(list,key))
        {
            match = {list:list, key:key, val:list[key]};
        }
    }
    else
    {
        var next = null, root = list;
        while (list)
        {
            if (key === list.val[0])
            {
                match = {list:root, node:list, nodePrev:list.prev, nodeNext:next, key:key, val:list.val[1]};
                break;
            }
            next = list; list = list.prev;
        }
    }
    return match;
};
Stack.addKey = function(list, key, val, hash) {
    if (hash)
    {
        list[key] = val;
        return list;
    }
    else
    {
        return new Stack([key,val], list);
    }
};
Stack.delKey = function(match, hash) {
    if (hash)
    {
        delete match.list[match.key];
    }
    else
    {
        if (match.nodeNext)
        {
            match.nodeNext.prev = match.nodePrev;
        }
        else
        {
            match.list = match.list.prev;
        }
    }
    return match.list;
};

function State(unique, s)
{
    var self = this;
    if (!(self instanceof State)) return new State(unique, s);

    // this enables unique state "names"
    self.id = unique ? uuid("state") : "state";
    if (s instanceof State)
    {
        // clone
        self.bline = s.bline;
        self.status = s.status;
        self.stack = s.stack ? s.stack.clone(false) : null;
        self.alt = s.alt ? s.alt.clone(false) : null;
        self.token = s.token;
        self.token2 = s.token2;
        self.block = s.block;
        self.outer = s.outer ? [s.outer[0], s.outer[1], new State(unique, s.outer[2]), s.outer[3]] : null;
        self.queu = s.queu || null;
        self.symb = s.symb || null;
        self.tabl = s.tabl || null;
        self.prec = s.prec || 0;
        self.assoc = s.assoc || 0;
        self.ctx = s.ctx ? new Stack({tabl:s.ctx.val.tabl,symb:s.ctx.val.symb,queu:s.ctx.val.queu,prec:s.ctx.val.prec,assoc:s.ctx.val.assoc}, s.ctx.prev) : null;
        self.hctx = s.hctx ? new Stack({tabl:s.hctx.val.tabl,symb:s.hctx.val.symb,queu:s.hctx.val.queu,prec:s.hctx.val.prec,assoc:s.hctx.val.assoc}, s.hctx.prev) : null;
        self.ast = /*merge({},*/s.ast/*)*/;
        self.err = s.err || null;
        self.$eol$ = s.$eol$; self.$blank$ = s.$blank$;
    }
    else
    {
        self.bline = -1;
        self.status = s || 0;
        self.stack = null;
        self.alt = null;
        self.token = null;
        self.token2 = null;
        self.block = null;
        self.outer = null;
        self.queu = null;
        self.symb = null;
        self.tabl = {};
        self.prec = 0;
        self.assoc = 0;
        self.ctx = null;
        self.hctx = null;
        self.ast = {};
        self.err = self.status & ERRORS ? {} : null;
        self.$eol$ = true; self.$blank$ = true;
    }
}
State[PROTO] = {
    constructor: State

    ,id: null
    ,bline: -1
    ,status: 0
    ,stack: null
    ,alt: null
    ,token: null
    ,token2: null
    ,block: null
    ,outer: null
    ,queu: null
    ,symb: null
    ,tabl: null
    ,prec: 0
    ,assoc: 0
    ,ctx: null
    ,hctx: null
    ,ast: null
    ,matches: null
    ,err: null
    ,$eol$: false
    ,$blank$: false

    ,dispose: function( ) {
        var state = this;
        state.id = null;
        state.bline = null;
        state.status = null;
        state.stack = null;
        state.alt = null;
        state.token = null;
        state.token2 = null;
        state.block = null;
        state.outer = null;
        state.queu = null;
        state.symb = null;
        state.tabl = null;
        state.prec = null;
        state.assoc = null;
        state.ctx = null;
        state.hctx = null;
        state.ast = null;
        state.matches = null;
        state.err = null;
        return state;
    }
    ,backup: function(stream, backup, with_errors, copy) {
        var state = this;
        if (backup)
        {
            state.status = backup[0];
            state.block = backup[1];
            state.outer = backup[2];
            state.stack = backup[3];
            //state.alt = backup[4];
            state.queu = backup[5];
            state.symb = backup[6];
            state.tabl = backup[12];
            state.prec = backup[13];
            state.assoc = backup[14];
            state.ctx = backup[7];
            state.hctx = backup[8];
            state.ast = backup[9];
            if (true === with_errors)
            {
                if ((stream.line > backup[10][1]) || (stream.line === backup[10][1] && stream.pos > backup[10][0]))
                    stream.bck(backup[10][0], backup[10][1], backup[10][2]);
            }
            else if (stream.pos > backup[10][0])
            {
                stream.bck(backup[10][0]);
            }
            state.bline = backup[11][0];
            state.$blank$ = backup[11][1]
            state.$eol$ = backup[11][2];
        }
        else
        {
            backup = [
                state.status,
                state.block,
                state.outer,
                state.stack,
                state.alt,
                state.queu,
                state.symb,
                state.ctx ? new Stack({tabl:copy ? merge({}, state.ctx.val.tabl) : state.ctx.val.tabl,symb:state.ctx.val.symb,queu:state.ctx.val.queu}, state.ctx.prev) : null,
                state.hctx ? new Stack({tabl:copy ? merge({}, state.hctx.val.tabl) : state.hctx.val.tabl,symb:state.hctx.val.symb,queu:state.hctx.val.queu}, state.hctx.prev) : null,
                copy ? merge({}, state.ast) : state.ast,
                [stream.pos, stream.line, stream.start],
                [state.bline, state.$blank$, state.$eol$],
                copy ? merge({}, state.tabl) : state.tabl,
                state.prec, state.assoc
            ];
            if (false === with_errors) state.status = 0;
            return backup;
        }
    }
    ,clean: function() {
        var self = this;
        self.stack = null;
        self.alt = null;
        self.token = null;
        self.token2 = null;
        self.block = null;
        self.queu = null;
        self.symb = null;
        self.tabl = {};
        self.prec = 0;
        self.assoc = 0;
        self.ctx = null;
        self.hctx = null;
        self.ast = {};
        self.err = self.status & ERRORS ? {} : null;
        return self;
    }
    ,error: function(l1, c1, l2, c2, t, err) {
        var state = this;
        if ((state.status & ERRORS) && state.err)
            state.err[String(l1+'_'+c1+'_'+l2+'_'+c2+'_'+(t?t.name:'ERROR'))] = [l1, c1, l2, c2, err || t.err()];
        //return state;
    }
    ,pushAt: function(pos, val) {
        var state = this, ptr;
        if (state.stack === pos)
        {
            pos = state.stack = new Stack(val, state.stack);
        }
        else
        {
            ptr = state.stack;
            while (ptr && (ptr.prev !== pos)) ptr = ptr.prev;
            pos = new Stack(val, pos);
            if (ptr) ptr.prev = pos;
        }
        return pos;
    }
    ,toString: function() {
        var self = this;
        return self.id+'_'+(self.block?self.block.name:'0');
    }
};

function Stream(text, space_re, non_space_re)
{
    var self = this;
    if (!(self instanceof Stream)) return new Stream(text, space_re, non_space_re);

    self.lines = String(text||"").split("\n");
    self.remLen = 0;
    self.line = -1;
    self.start = 0;
    self.pos = 0;
    self.str = '';
    self.space_re = null==space_re ? Stream.$SPC$ : space_re;
    self.non_space_re = null==non_space_re ? Stream.$NONSPC$ : non_space_re;
}
Stream[PROTO] = {
    constructor: Stream

    ,lines: null
    ,remLen: 0
    ,line: -1
    ,start: 0
    ,pos: 0
    ,str: null
    ,space_re: null
    ,non_space_re: null

    ,dispose: function() {
        var self = this;
        self.lines = null;
        self.remLen = null;
        self.line = null;
        self.start = null;
        self.pos = null;
        self.str = null;
        self.space_re = null;
        self.non_space_re = null;
        return self;
    }

    // start-of-line?
    ,sol: function() {
        var self = this;
        return 0 === self.pos;
    }

    // end-of-line?
    ,eol: function() {
        var self = this;
        return self.pos >= self.str.length;
    }

    // start-of-file?
    ,sof: function() {
        var self = this;
        return (0 === self.line) && (0 === self.pos);
    }

    // end-of-file?
    ,eof: function() {
        var self = this;
        return (self.line >= self.lines.length) || ((self.line+1===self.lines.length) && (self.pos >= self.str.length));
    }

    ,ind: function(pos) {
        var self = this;
        return self.remLen + (arguments.length ? (pos||0) : self.pos);
    }

    // skip to end
    ,end: function() {
        var self = this;
        self.pos = self.str.length;
        return self;
    }

    ,lin: function(i) {
        var self = this;
        if (!arguments.length) i = MIN(self.line+1, self.lines.length);
        if (i !== self.line)
        {
            self.line = i;
            if (0<=i && i<self.lines.length)
            {
                self.remLen = self.lines.slice(0, i).reduce(function(rem, line){
                    return rem+line.length+1;
                }, 0);
                // add back the newlines removed from split-ting
                self.str = self.lines[i]+(i+1<self.lines.length?"\n":"");
            }
            else
            {
                self.remLen = 0;
                self.str = '';
            }
        }
        self.start = 0;
        self.pos = 0;
        return self;
    }

    // move pointer forward/backward n steps
    ,mov: function(n) {
        var self = this;
        self.pos = 0 > n ? MAX(0, self.pos+n) : MIN(self.str.length, self.pos+n);
        return self;
    }

    // move pointer back to pos/line
    ,bck: function(pos, line, start) {
        var self = this;
        if (1 < arguments.length)
        {
            self.lin(line);
            self.pos = MAX(0, pos);
            self.start = self.pos;
            if (2 < arguments.length) self.start = MAX(0, MIN(self.pos, start));
        }
        else
        {
            self.pos = MAX(0, pos);
            if (self.start > self.pos) self.start = self.pos;
        }
        return self;
    }

    // move/shift stream
    ,sft: function() {
        var self = this;
        self.start = self.pos;
        return self;
    }

    // next char(s) or whole token
    ,nxt: function(num, re_token) {
        var self = this, c, token = '', n;
        if (true === num)
        {
            re_token = re_token || self.non_space_re;
            while ((self.pos<self.str.length) && re_token.test(c=self.str[CHAR](self.pos++))) token += c;
            return token.length ? token : null;
        }
        else
        {
            num = num||1; n = 0;
            while ((n++ < num) && (self.pos<self.str.length)) token += self.str[CHAR](self.pos++);
            return token;
        }
    }

    // current stream selection
    ,cur: function(shift) {
        var self = this, ret = self.str.slice(self.start, self.pos);
        if (shift) self.start = self.pos;
        return ret;
    }

    // stream selection
    ,sel: function(p0, p1) {
        var self = this;
        return self.str.slice(p0, p1);
    }

    // eat "space"
    ,spc: function(eat, re_space) {
        var self = this, m;
        re_space = re_space || self.space_re;
        if (!re_space) return;
        if (m = self.str.slice(self.pos).match(re_space))
        {
            if (false !== eat) self.mov(m[0].length);
            return m[0];
        }
    }

    ,pass: function(pos, n, shift) {
        var self = this;
        if ((pos === self.pos) && (0 < n)) self.pos += n;
        if (shift) self.start = self.pos;
        return self;
    }
};
Stream.$SPC$ = /^[\s\u00a0]+/;
Stream.$NONSPC$ = /[^\s\u00a0]/;
Stream.$NOTEMPTY$ = /\S/;
Stream.$SPACE$ = /^\s*/;
// Counts the column offset in a string, taking tabs into account.
// Used mostly to find indentation.
// adapted from codemirror countColumn
Stream.countColumn = function(string, end, tabSize, startIndex, startValue) {
    var i, n, nextTab;
    if (null == end)
    {
        end = string.search(Stream.$NONSPC$);
        if (-1 === end) end = string.length;
    }
    for (i=startIndex||0,n=startValue||0 ;;)
    {
        nextTab = string.indexOf("\t", i);
        if (nextTab < 0 || nextTab >= end) return n + (end - i);
        n += nextTab - i;
        n += tabSize - (n % tabSize);
        i = nextTab + 1;
    }
};

function Grammar(json)
{
    var self = this;
    if (!(self instanceof Grammar)) return new Grammar(json);
    self.$json = json || {};
}
Grammar.REX = RE;
Grammar.RE = function(r, rid, cachedRegexes, boundary) {
    var T = get_type(r);
    if (T_REGEX === T) re = new RE(r);
    if (!r || (T_NUM === T) || (T_XREGEX === T)) return r;

    var l = rid ? (rid.length||0) : 0, i, b = "", xflags = {g:0,i:0,x:0,l:0};

    if (T_STR & get_type(boundary)) b = boundary;
    else if (!!boundary) b = combine_delimiter;

    if (l && (r.substr(0, l) === rid))
    {
        var regexSource = r.substr(l), delim = regexSource[CHAR](0), regexBody, regexID, regex, i, ch;

        // allow regex to have delimiters and flags
        // delimiter is defined as the first character after the regexID
        i = regexSource.length;
        while (i--)
        {
            ch = regexSource[CHAR](i);
            if (delim === ch) break;
            else if ('i' === ch.toLowerCase()) xflags.i = 1;
            else if ('x' === ch.toLowerCase()) xflags.x = 1;
            else if ('l' === ch.toLowerCase()) xflags.l = 1;
        }
        regexBody = regexSource.substring(1, i);
        if ('^' === regexBody.charAt(0))
        {
            xflags.l = 1;
            regexID = "^(" + regexBody.slice(1) + ")";
        }
        else
        {
            regexID = "^(" + regexBody + ")";
        }
        regex = regexID;
        if (xflags.x || xflags.l || xflags.i)
            regexID = (xflags.l?'l':'')+(xflags.x?'x':'')+(xflags.i?'i':'')+'::'+regexID;

        if (!cachedRegexes[regexID])
        {
            regex = new_re(regex, xflags);
            // shared, light-weight
            cachedRegexes[regexID] = regex;
        }

        return cachedRegexes[regexID];
    }
    else if (!!b)
    {
        regex = regexID = "^(" + esc_re(r) + ")"+b;

        if (!cachedRegexes[regexID])
        {
            regex = new_re(regex, xflags);
            // shared, light-weight
            cachedRegexes[regexID] = regex;
        }

        return cachedRegexes[regexID];
    }
    else
    {
        return r;
    }
};
Grammar.CRE = function(tokens, boundary, case_insensitive) {
    var b = "", combined;
    if (T_STR & get_type(boundary)) b = boundary;
    else if (!!boundary) b = combine_delimiter;
    combined = tokens.sort(by_length).map(esc_re).join("|");
    return [new_re("^(" + combined + ")"+b, {l:0,x:0,i:case_insensitive?1:0}), 1];
};
Grammar[PROTO] = {
    constructor: Grammar

    ,$json: null
    ,$obj: null

    ,dispose: function() {
        var self = this;
        self.$json = null;
        self.$obj = null;
        return self;
    }

    ,simplematcher: function(name, pattern, key, cachedMatchers) {
        var T = get_type(pattern);

        if (T_NUM === T) return pattern;
        if (cachedMatchers[name] ) return cachedMatchers[name];

        key = key || 0;
        var mtcher, is_char_list = 0;

        if (pattern && pattern.isCharList) {is_char_list = 1; del(pattern,'isCharList');}

        // get a fast customized matcher for < pattern >
        if (T_NULL === T) mtcher = new Parser.Matcher(P_SIMPLE, name, pattern, T_NULL, key);
        else if (T_CHAR === T) mtcher = new Parser.Matcher(P_SIMPLE, name, pattern, T_CHAR, key);
        else if (T_REGEX_OR_ARRAY & T) mtcher = new Parser.Matcher(P_SIMPLE, name, pattern, T_REGEX, key);
        else if (T_STR & T) mtcher = new Parser.Matcher(P_SIMPLE, name, pattern, is_char_list ? T_CHARLIST : T_STR, key);
        else mtcher = pattern; // unknown

        return cachedMatchers[name] = mtcher;
    }

    ,compomatcher: function(name, tokens, RegExpID, combined, caseInsensitive, cachedRegexes, cachedMatchers) {
        if (cachedMatchers[name]) return cachedMatchers[name];

        var self = this, tmp, i, l, l2, array_of_arrays = 0,
            has_regexs = 0, is_char_list = 1,
            T1, T2, mtcher, combine = T_STR & get_type(combined) ? true : !!combined;

        tmp = make_array(tokens); l = tmp.length;

        if (1 === l)
        {
            mtcher = self.simplematcher(name, Parser.Grammar.RE(tmp[0], RegExpID, cachedRegexes, combined), 0, cachedMatchers);
        }
        else if (1 < l /*combined*/)
        {
            l2 = (l>>>1) + 1;
            // check if tokens can be combined in one regular expression
            // if they do not contain sub-arrays or regular expressions
            for (i=0; i<=l2; ++i)
            {
                T1 = get_type(tmp[i]); T2 = get_type(tmp[l-1-i]);

                if ((T_CHAR !== T1) || (T_CHAR !== T2))
                {
                    is_char_list = 0;
                }

                if ((T_ARRAY & T1) || (T_ARRAY & T2))
                {
                    array_of_arrays = 1;
                    //break;
                }
                else if ((T_REGEX & T1) || (T_REGEX & T2) ||
                    has_prefix(tmp[i], RegExpID) || has_prefix(tmp[l-1-i], RegExpID))
                {
                    has_regexs = 1;
                    //break;
                }
            }

            if (is_char_list && !combine)
            {
                tmp = tmp.slice().join('');
                tmp.isCharList = 1;
                mtcher = self.simplematcher(name, tmp, 0, cachedMatchers);
            }
            else if (combine && !(array_of_arrays || has_regexs))
            {
                mtcher = self.simplematcher(name, Parser.Grammar.CRE(tmp, combined, caseInsensitive), 0, cachedMatchers);
            }
            else if (array_of_arrays || has_regexs)
            {
                for (i=0; i<l; ++i)
                {
                    if (T_ARRAY & get_type(tmp[i]))
                        tmp[i] = self.compomatcher(name + '_' + i, tmp[i], RegExpID, combined, caseInsensitive, cachedRegexes, cachedMatchers );
                    else
                        tmp[i] = self.simplematcher(name + '_' + i, Parser.Grammar.RE( tmp[i], RegExpID, cachedRegexes ), i, cachedMatchers);
                }

                mtcher = l > 1 ? new Parser.Matcher(P_COMPOSITE, name, tmp) : tmp[0];
            }
            else /* strings */
            {
                tmp = tmp.sort(by_length);
                for (i=0; i<l; ++i)
                {
                    tmp[i] = self.simplematcher(name + '_' + i, Parser.Grammar.RE(tmp[i], RegExpID, cachedRegexes), i, cachedMatchers);
                }

                mtcher = l > 1 ? new Parser.Matcher(P_COMPOSITE, name, tmp) : tmp[0];
            }
        }
        return cachedMatchers[name] = mtcher;
    }

    ,blockmatcher: function(name, tokens, RegExpID, cachedRegexes, cachedMatchers) {
        if (cachedMatchers[name]) return cachedMatchers[name];

        var self = this, tmp = make_array_2( tokens ), start = [], end = [],
            i, t1, t2, is_regex, is_regex_pattern;

        // build start/end mappings
        for (i=0; i<tmp.length; ++i)
        {
            t1 = self.simplematcher(name + '_0_' + i, Parser.Grammar.RE(tmp[i][0], RegExpID, cachedRegexes), i, cachedMatchers);
            if (tmp[i].length > 1)
            {
                is_regex = has_prefix(tmp[i][1], RegExpID);
                is_regex_pattern = is_regex && /*regex_pattern_re*/extended_regex_re.test(tmp[i][1]);
                if ((T_REGEX === t1.ptype) && (T_STR === get_type( tmp[i][1] )) && (is_regex_pattern || !is_regex))
                {
                    if (is_regex_pattern)
                    {
                        t2 = new String(tmp[i][1]);
                        t2.regex_pattern = RegExpID;
                    }
                    else
                    {
                        t2 = tmp[i][1];
                    }
                }
                else
                {
                    t2 = self.simplematcher(name + '_1_' + i, Parser.Grammar.RE( tmp[i][1], RegExpID, cachedRegexes ), i, cachedMatchers);
                }
            }
            else
            {
                t2 = t1;
            }
            start.push(t1);  end.push(t2);
        }

        return cachedMatchers[name] = new Parser.Matcher(P_BLOCK, name, [start, end]);
    }

    ,tokenizer: function(tokenID, RegExpID, Lex, Syntax,
                        cachedRegexes, cachedMatchers, cachedTokens,
                        interleavedTokens, comments) {
        var self = this, $token$ = null, $msg$ = null, $group$ = null, $type$, $tokens$, t, tt, token, combine, autocompletions;

        if (T_SOF === tokenID || T_FNBL === tokenID || T_SOL === tokenID || T_EOL === tokenID)
        {
            // SOF/FNBL/SOL/EOL Token
            return new Parser.Tokenizer(tokenID, T_SOF === tokenID
                                                ? $T_SOF$
                                                : (T_FNBL === tokenID
                                                    ? $T_FBNL$
                                                    : (T_SOL === tokenID ? $T_SOL$ : $T_EOL$)
                                                ), tokenID, $msg$);
        }

        else if (false === tokenID || 0/*T_EMPTY*/ === tokenID)
        {
            // EMPTY Token
            return new Parser.Tokenizer(T_EMPTY, $T_EMPTY$, 0, $msg$);
        }

        else if ('' === tokenID)
        {
            // NONSPACE Token
            return new Parser.Tokenizer(T_NONSPACE, $T_NONSPACE$, '', $msg$);
        }

        else if (null === tokenID)
        {
            // skip-to-EOL Token
            return new Parser.Tokenizer(T_SIMPLE, $T_NULL$, T_NULL, $msg$, $group$);
        }

        tokenID = String(tokenID);
        if (cachedTokens[tokenID]) return cachedTokens[tokenID];

        token = self.bckRef(tokenID, Lex, Syntax, 0, tokenID.split('.')[1]);
        if (T_STR & get_type(token))
        {
            token = self.parsePEG(token, Lex, Syntax);
            token = Lex[token] || Syntax[token] || null;
        }
        if (!token) return null;

        $type$ = token.type ? tokenTypes[token.type[LOWER]().replace(dashes_re, '')] || T_SIMPLE : T_SIMPLE;
        $msg$ = token.msg || null; $group$ = T_STR & get_type(token.group) ? token.group : null;
        $tokens$ = token.tokens;

        if (T_SIMPLE & $type$)
        {
            if (T_SOF === $tokens$ || T_FNBL === $tokens$ || T_SOL === $tokens$ || T_EOL === $tokens$ ||
                false === $tokens$ || 0/*T_EMPTY*/ === $tokens$)
            {
                // SOF/FNBL/SOL/EOL/EMPTY Token
                $token$ = new Parser.Tokenizer($tokens$ || T_EMPTY , tokenID, $tokens$ || 0, $msg$);
                // pre-cache tokenizer to handle recursive calls to same tokenizer
                cachedTokens[tokenID] = $token$; return $token$;
            }

            else if ('' === $tokens$)
            {
                // NONSPACE Token
                $token$ = new Parser.Tokenizer(T_NONSPACE, tokenID, '', $msg$);
                // pre-cache tokenizer to handle recursive calls to same tokenizer
                cachedTokens[tokenID] = $token$; return $token$;
            }

            else if (null === $tokens$)
            {
                // skip-to-EOL Token
                $token$ = new Parser.Tokenizer(T_SIMPLE, tokenID, T_NULL, $msg$, $group$);
                // pre-cache tokenizer to handle recursive calls to same tokenizer
                cachedTokens[tokenID] = $token$; return $token$;
            }

            else if (!$tokens$)
            {
                return null;
            }
        }

        if (T_ACTION & $type$)
        {
            token.options = token.options || {};
            token.options['in-context'] = !!(token.options['in-context'] || token['in-context']);
            token.options['in-hypercontext'] = !!(token.options['in-hypercontext'] || token['in-hypercontext']);
            token.options.ci = token.ci = !!(token.options.caseInsesitive || token.options.ci || token.caseInsesitive || token.ci);
            token.options.autocomplete = !!(token.options.autocomplete || token.autocomplete);
            token.options.mode = token.options.mode || token.mode;

            if (!HAS.call(token,'action'))
            {
                if (HAS.call(token,'nop')) token.action = [A_NOP, token.nop, token['options']];
                else if (HAS.call(token,'error')) token.action = [A_ERROR, token.error, token['options']];
                else if (HAS.call(token,'precedence')) token.action = [A_PRECEDE, token.precedence, token['options']];
                else if (HAS.call(token,'associativity')) token.action = [A_ASSOCIAT, token.associativity, token['options']];
                else if (HAS.call(token,'context')) token.action = [!!token.context?A_CTXSTART:A_CTXEND, token['context'], token['options']];
                else if (HAS.call(token,'hypercontext')) token.action = [!!token.hypercontext?A_HYPCTXSTART:A_HYPCTXEND, token['hypercontext'], token['options']];
                else if (HAS.call(token,'context-start')) token.action = [A_CTXSTART, token['context-start'], token['options']];
                else if (HAS.call(token,'context-end')) token.action = [A_CTXEND, token['context-end'], token['options']];
                else if (HAS.call(token,'hypercontext-start')) token.action = [A_HYPCTXSTART, token['hypcontext-start'], token['options']];
                else if (HAS.call(token,'hypercontext-end')) token.action = [A_HYPCTXEND, token['hypcontext-end'], token['options']];
                else if (HAS.call(token,'push')) token.action = [A_MCHSTART, token.push, token['options']];
                else if (HAS.call(token,'pop')) token.action = [A_MCHEND, token.pop, token['options']];
                else if (HAS.call(token,'define')) token.action = [A_DEFINE, T_STR&get_type(token.define)?['*',token.define]:token.define, token['options']];
                else if (HAS.call(token,'undefine')) token.action = [A_UNDEFINE, T_STR&get_type(token.undefine)?['*',token.undefine]:token.undefine, token['options']];
                else if (HAS.call(token,'defined')) token.action = [A_DEFINED, T_STR&get_type(token.defined)?['*',token.defined]:token.defined, token['options']];
                else if (HAS.call(token,'notdefined')) token.action = [A_NOTDEFINED, T_STR&get_type(token.notdefined)?['*',token.notdefined]:token.notdefined, token['options']];
                else if (HAS.call(token,'unique')) token.action = [A_UNIQUE, T_STR&get_type(token.unique)?['*',token.unique]:token.unique, token['options']];
            }
            else
            {
                if ('nop' === token.action[0]) token.action[0] = A_NOP;
                else if ('error' === token.action[0]) token.action[0] = A_ERROR;
                else if ('precedence' === token.action[0]) token.action[0] = A_PRECEDE;
                else if ('associativity' === token.action[0]) token.action[0] = A_ASSOCIAT;
                else if ('context-start' === token.action[0]) token.action[0] = A_CTXSTART;
                else if ('context-end' === token.action[0]) token.action[0] = A_CTXEND;
                else if ('hypercontext-start' === token.action[0]) token.action[0] = A_HYPCTXSTART;
                else if ('hypercontext-end' === token.action[0]) token.action[0] = A_HYPCTXEND;
                else if ('push' === token.action[0]) token.action[0] = A_MCHSTART;
                else if ('pop' === token.action[0]) token.action[0] = A_MCHEND;
                else if ('define' === token.action[0]) token.action[0] = A_DEFINE;
                else if ('undefine' === token.action[0]) token.action[0] = A_UNDEFINE;
                else if ('defined' === token.action[0]) token.action[0] = A_DEFINED;
                else if ('notdefined' === token.action[0]) token.action[0] = A_NOTDEFINED;
                else if ('unique' === token.action[0]) token.action[0] = A_UNIQUE;
            }
            if (false === token.msg) $msg$ = false;
            // NOP action, no action
            if (token.nop) token.action[0] = A_NOP;
            $token$ = new Parser.Tokenizer(T_ACTION, tokenID, token.action.slice(), $msg$, $group$);
            $token$.ci = !!(token.options.caseInsensitive || token.options.ci || token.caseInsensitive || token.ci);
            // pre-cache tokenizer to handle recursive calls to same tokenizer
            cachedTokens[tokenID] = $token$;
        }

        else
        {
            $tokens$ = make_array($tokens$);

            if (T_SIMPLE & $type$)
            {
                // combine by default if possible using default word-boundary delimiter
                combine = 'undefined' !== typeof token.combine ? token.combine : (T_ARRAY&get_type(token.tokens) ? true : false);
                $token$ = new Parser.Tokenizer(T_SIMPLE, tokenID,
                            self.compomatcher( tokenID, $tokens$.slice(), RegExpID, combine,
                            !!(token.caseInsensitive||token.ci), cachedRegexes, cachedMatchers ),
                            $msg$, $group$, null);
                if (token.sep) $token$.sep = true;
                // pre-cache tokenizer to handle recursive calls to same tokenizer
                cachedTokens[tokenID] = $token$;

                // token has excepted matches/tokens, e.g keywords
                if (null != token.except)
                {
                    var token_except = make_array(token.except), i, l = token_except.length, except = [], tok_exce;
                    for (i=0; i<l; ++i)
                    {
                        if (!!token_except[i])
                        {
                            tok_exce = self.tokenizer(token_except[i], RegExpID, Lex, Syntax,
                                                    cachedRegexes, cachedMatchers, cachedTokens,
                                                    interleavedTokens, comments);
                            if (tok_exce) except.push(tok_exce);
                        }
                    }
                    if (except.length) $token$.except = except;
                }
                if (token.interleave) interleavedTokens.push($token$.clone());
            }

            else if (T_BLOCK & $type$)
            {
                $token$ = new Parser.Tokenizer($type$, tokenID,
                            self.blockmatcher(tokenID, $tokens$.slice(), RegExpID, cachedRegexes, cachedMatchers),
                            $msg$);
                $token$.empty = HAS.call(token,'empty') ? !!token.empty : true;
                $token$.mline = HAS.call(token,'multiline') ? !!token.multiline : true;
                $token$.esc = HAS.call(token,'escape') ? token.escape : false;
                if (/*(T_COMMENT === $type$) &&*/ token.interleave) interleavedTokens.push($token$.clone());
                if ($group$) $token$.group = $group$;
                // pre-cache tokenizer to handle recursive calls to same tokenizer
                cachedTokens[tokenID] = $token$;
            }

            else if (T_COMPOSITE & $type$)
            {
                if (T_SUBGRAMMAR === $type$)
                {
                    // pre-cache tokenizer to handle recursive calls to same tokenizer
                    cachedTokens[tokenID] = new Parser.Tokenizer(T_SUBGRAMMAR, tokenID, $tokens$, $msg$, $group$);
                }

                else
                {
                    if (T_POSITIVE_LOOKAHEAD === $type$ || T_NEGATIVE_LOOKAHEAD === $type$)
                    {
                        $token$ = new Parser.Tokenizer($type$, tokenID, null, $msg$, $group$);
                    }
                    else if ((T_REPEATED & $type$) && (T_ARRAY & get_type(token.repeat)))
                    {
                        $token$ = new Parser.Tokenizer(T_REPEATED, tokenID, null, $msg$, $group$);
                        $token$.min = token.repeat[0]; $token$.max = token.repeat[1];
                    }
                    else if (T_ZEROORONE === $type$)
                    {
                        $token$ = new Parser.Tokenizer(T_ZEROORONE, tokenID, null, $msg$, $group$);
                        $token$.min = 0; $token$.max = 1;
                    }

                    else if (T_ZEROORMORE === $type$)
                    {
                        $token$ = new Parser.Tokenizer(T_ZEROORMORE, tokenID, null, $msg$, $group$);
                        $token$.min = 0; $token$.max = INF;
                    }

                    else if (T_ONEORMORE === $type$)
                    {
                        $token$ = new Parser.Tokenizer(T_ONEORMORE, tokenID, null, $msg$, $group$);
                        $token$.min = 1; $token$.max = INF;
                    }

                    else if (T_ALTERNATION === $type$)
                    {
                        $token$ = new Parser.Tokenizer(T_ALTERNATION, tokenID, null, $msg$, $group$);
                    }

                    else //if (T_SEQUENCE === $type$)
                    {
                        $token$ = new Parser.Tokenizer(T_SEQUENCE, tokenID, null, $msg$, $group$);
                    }

                    // pre-cache tokenizer to handle recursive calls to same tokenizer
                    cachedTokens[tokenID] = $token$;

                    $token$.token = make_array($tokens$.reduce(function(subTokenizers, t) {
                        return subTokenizers.concat(self.tokenizer(t, RegExpID, Lex, Syntax, cachedRegexes, cachedMatchers, cachedTokens, interleavedTokens, comments));
                    }, []));
                }
            }
        }
        return cachedTokens[tokenID];
    }

    ,preprocess: function(grammar) {
        if (!grammar.Lex) grammar.Lex = {};
        if (!grammar.Syntax) grammar.Syntax = {};
        var id, type, t, tok, T, xtends, xtok, tl, tt,
            Lex = grammar.Lex, Syntax = grammar.Syntax,
            conf = [Lex, Syntax], nG = conf.length, G, i, i1, i2, T1;

        // handle token-type annotations in token_ID
        i = 0;
        while (i < nG)
        {
            G = conf[i++];
            for (t in G)
            {
                if (!HAS.call(G,t)) continue;
                id = t.split(':');
                type = id[1] && trim(id[1]).length ? trim(id[1]) : null;
                id = trim(id[0]);
                if (!id.length) {id=t; type=null;} // literal ':' token, bypass
                if (id !== t)
                {
                    G[id] = G[t]; del(G,t);
                    if (type)
                    {
                        type = type[LOWER]();
                        tok = G[id]; T = get_type(tok);
                        if (T_OBJ === T)
                        {
                            if (!G[id].type) G[id].type = type;
                        }
                        else
                        {
                            G[id] = {type:type};
                            if ('error' === type)
                            {
                                G[id].type = 'action';
                                G[id].error = tok;
                            }
                            else if ('nop' === type)
                            {
                                G[id].type = 'action';
                                G[id].nop = true;
                            }
                            else if ('group' === type)
                            {
                                G[id].type = 'sequence';
                                G[id].tokens = tok;
                            }
                            else if ('action' === type && T_STR === T)
                            {
                                G[id][tok] = true;
                            }
                            else
                            {
                                G[id].tokens = tok;
                            }
                        }
                    }
                }
                if (Lex === G)
                {
                    if (T_STR_OR_ARRAY_OR_REGEX & get_type(G[id]))
                    {
                        // simple token given as literal token, wrap it
                        G[id] = {type:'simple', tokens:G[id]};
                    }
                    //if (!G[id].type) G[id].type = 'simple';
                    tok = G[id];

                    if (tok.type)
                    {
                        tl = tok.type = tok.type[LOWER]();

                        if ('line-block' === tl)
                        {
                            tok.type = 'block';
                            tok.multiline = false;
                            tok.escape = false;
                        }
                        else if ('escaped-line-block' === tl)
                        {
                            tok.type = 'block';
                            tok.multiline = false;
                            tok.escape = '\\';
                        }
                        else if ('escaped-block' === tl)
                        {
                            tok.type = 'block';
                            tok.multiline = true;
                            tok.escape = '\\';
                        }
                    }
                }
            }
        }

        // handle token extensions in Lex, if any
        G = Lex;
        for (id in G)
        {
            if (!HAS.call(G,id)) continue;
            tok = G[id];
            // allow tokens to extend / reference other tokens
            while (tok['extend'])
            {
                xtends = tok['extend']; del(tok,'extend');
                xtok = Lex[xtends]/* || Syntax[xtends]*/;
                if (xtok)
                {
                    // tokens given directly, no token configuration object, wrap it
                    if (T_STR_OR_ARRAY_OR_REGEX & get_type(xtok))
                    {
                        xtok = Lex[xtends] = {type:'simple', tokens:xtok};
                    }
                    //if (!xtok.type) xtok.type = 'simple';
                    tok = extend(xtok, tok);
                }
                // xtok may in itself extend another tok and so on,
                // loop and get all references
            }
        }

        // handle Lex shorthands and defaults
        G = Lex;
        for (id in G)
        {
            if (!HAS.call(G,id)) continue;
            tok = G[id];
            if (tok.type)
            {
                tl = tok.type = tok.type[LOWER]();
                if ('action' === tl)
                {
                    tok.options = tok.options||{};
                }
                else if ('line-block' === tl)
                {
                    tok.type = 'block';
                    tok.multiline = false;
                    tok.escape = false;
                }
                else if ('escaped-line-block' === tl)
                {
                    tok.type = 'block';
                    tok.multiline = false;
                    tok.escape = '\\';
                }
                else if ('escaped-block' === tl)
                {
                    tok.type = 'block';
                    tok.multiline = true;
                    tok.escape = '\\';
                }
            }
            else
            {
                if (tok['escaped-line-block'])
                {
                    tok.type = 'block';
                    tok.multiline = false;
                    if (!tok.escape) tok.escape = '\\';
                    tok.tokens = tok['escaped-line-block'];
                    del(tok,'escaped-line-block');
                }
                else if (tok['escaped-block'])
                {
                    tok.type = 'block';
                    tok.multiline = true;
                    if (!tok.escape) tok.escape = '\\';
                    tok.tokens = tok['escaped-block'];
                    del(tok,'escaped-block');
                }
                else if (tok['line-block'])
                {
                    tok.type = 'block';
                    tok.multiline = false;
                    tok.escape = false;
                    tok.tokens = tok['line-block'];
                    del(tok,'line-block');
                }
                else if (tok['comment'])
                {
                    tok.type = 'comment';
                    tok.escape = false;
                    tok.tokens = tok['comment'];
                    del(tok,'comment');
                }
                else if (tok['block'])
                {
                    tok.type = 'block';
                    tok.tokens = tok['block'];
                    del(tok,'block');
                }
                else if (tok['simple'])
                {
                    tok.type = 'simple';
                    tok.tokens = tok['simple'];
                    del(tok,'simple');
                }
                else if (tok['nop'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['nop', tok.nop, tok.options];
                    tok.nop = true;
                }
                else if (tok['error'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['error', tok.error, tok.options];
                    del(tok,'error');
                }
                else if (HAS.call(tok,'hypercontext'))
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = [!!tok.hypercontext ? 'hypercontext-start' : 'hypercontext-end', tok['hypercontext'], tok.options];
                    del(tok,'hypercontext');
                }
                else if (HAS.call(tok,'context'))
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = [!!tok.context ? 'context-start' : 'context-end', tok['context'], tok.options];
                    del(tok,'context');
                }
                else if (HAS.call(tok,'precedence'))
                {
                    tok.type = 'precedence';
                    tok.options = tok.options||{};
                    tok.action = ['precedence', tok['precedence'], tok.options];
                    del(tok,'precedence');
                }
                else if (HAS.call(tok,'associativity'))
                {
                    tok.type = 'associativity';
                    tok.options = tok.options||{};
                    tok.action = ['associativity', tok['associativity'], tok.options];
                    del(tok,'associativity');
                }
                else if (tok['define'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['define', T_STR&get_type(tok.define) ? ['*', tok.define] : tok.define, tok.options];
                    del(tok,'define');
                }
                else if (tok['undefine'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['undefine', T_STR&get_type(tok.undefine) ? ['*', tok.undefine] : tok.undefine, tok.options];
                    del(tok,'undefine');
                }
                else if (tok['defined'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['defined', T_STR&get_type(tok.defined) ? ['*', tok.defined] : tok.defined, tok.options];
                    del(tok,'defined');
                }
                else if (tok['notdefined'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['notdefined', T_STR&get_type(tok.notdefined) ? ['*', tok.notdefined] : tok.notdefined, tok.options];
                    del(tok,'notdefined');
                }
                else if (tok['unique'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['unique', T_STR&get_type(tok.unique) ? ['*', tok.unique] : tok.unique, tok.options];
                    del(tok,'unique');
                }
                else if (tok['push'])
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['push', tok.push, tok.options];
                    del(tok,'push');
                }
                else if (HAS.call(tok,'pop'))
                {
                    tok.type = 'action';
                    tok.options = tok.options||{};
                    tok.action = ['pop', tok.pop, tok.options];
                    del(tok,'pop');
                }
                else
                {
                    tok.type = 'simple';
                }
            }
            if ('action' === tok.type)
            {
                tok.options = tok.options||{};
                tok.options['in-context'] = !!(tok.options['in-context'] || tok['in-context']);
                tok.options['in-hypercontext'] = !!(tok.options['in-hypercontext'] || tok['in-hypercontext']);
                tok.options.ci = tok.ci = !!(tok.options.caseInsesitive || tok.options.ci || tok.caseInsesitive || tok.ci);
                tok.options.autocomplete = !!(tok.options.autocomplete || tok.autocomplete);
                tok.options.mode = tok.options.mode || tok.mode;
            }
            else if ('block' === tok.type || 'comment' === tok.type)
            {
                tok.multiline = HAS.call(tok,'multiline') ? !!tok.multiline : true;
                if (!(T_STR & get_type(tok.escape))) tok.escape = false;
            }
            else if ('simple' === tok.type)
            {
                //tok.autocomplete = !!tok.autocomplete;
                tok.meta = !!tok.autocomplete && (T_STR & get_type(tok.meta)) ? tok.meta : null;
                //tok.combine = !HAS.call(tok,'combine') ? true : tok.combine;
                tok.ci = !!(tok.caseInsesitive||tok.ci);
            }
        }

        // handle Syntax shorthands and defaults
        G = Syntax;
        for (id in G)
        {
            if (!HAS.call(G,id)) continue;
            tok = G[id];
            if (T_OBJ === get_type(tok) && !tok.type)
            {
                if (tok['sequence'] || tok['all'])
                {
                    tok.type = 'sequence';
                    tok.tokens = tok['sequence'] || tok['all'];
                    if (tok['all']) del(tok,'all'); else del(tok,'sequence');
                }
                else if (tok['alternation'] || tok['either'])
                {
                    tok.type = 'alternation';
                    tok.tokens = tok['alternation'] || tok['either'];
                    if (tok['either']) del(tok,'either'); else del(tok,'alternation');
                }
                else if (tok['zeroOrOne'])
                {
                    tok.type = 'zeroOrOne';
                    tok.tokens = tok['zeroOrOne'];
                    del(tok,'zeroOrOne');
                }
                else if (tok['zeroOrMore'])
                {
                    tok.type = 'zeroOrMore';
                    tok.tokens = tok['zeroOrMore'];
                    del(tok,'zeroOrMore');
                }
                else if (tok['oneOrMore'])
                {
                    tok.type = 'oneOrMore';
                    tok.tokens = tok['oneOrMore'];
                    del(tok,'oneOrMore');
                }
                else if (tok['positiveLookahead'] || tok['lookahead'])
                {
                    tok.type = 'positiveLookahead';
                    tok.tokens = tok['positiveLookahead'] || tok['lookahead'];
                    if (tok['lookahead']) del(tok,'lookahead'); else del(tok,'positiveLookahead');
                }
                else if (tok['negativeLookahead'])
                {
                    tok.type = 'negativeLookahead';
                    tok.tokens = tok['negativeLookahead'];
                    del(tok,'negativeLookahead');
                }
                else if (tok['subgrammar'] || tok['grammar'])
                {
                    tok.type = 'subgrammar';
                    tok.tokens = tok['subgrammar'] || tok['grammar'];
                    if (tok['subgrammar']) del(tok,'subgrammar'); else del(tok,'grammar');
                }
            }
            else if (tok.type)
            {
                tl = tok.type = tok.type[LOWER]();
                if ('group' === tl && tok.match)
                {
                    T = get_type(tok.match);
                    if (T_STR & T)
                    {
                        tt = tok.match[LOWER]();
                        if ('alternation' === tt || 'either' === tt)
                        {
                            tok.type = 'alternation';
                            del(tok,'match');
                        }
                        else if ('sequence' === tt || 'all' === tt)
                        {
                            tok.type = 'sequence';
                            del(tok,'match');
                        }
                        else if ('zeroorone' === tt)
                        {
                            tok.type = 'zeroOrOne';
                            del(tok,'match');
                        }
                        else if ('zeroormore' === tt)
                        {
                            tok.type = 'zeroOrMore';
                            del(tok,'match');
                        }
                        else if ('oneormore' === tt)
                        {
                            tok.type = 'oneOrMore';
                            del(tok,'match');
                        }
                        else
                        {
                            tok.type = 'sequence';
                            del(tok,'match');
                        }
                    }
                    else if (T_ARRAY & T)
                    {
                        tok.type = 'repeat';
                        tok.repeat = tok.match;
                        del(tok,'match');
                    }
                }
                else if ('either' === tl)
                {
                    tok.type = 'alternation';
                }
                else if ('all' === tl)
                {
                    tok.type = 'sequence';
                }
                else if ('lookahead' === tl)
                {
                    tok.type = 'positiveLookahead';
                }
                else if ('grammar' === tl)
                {
                    tok.type = 'subgrammar';
                }
                if ('subgrammar' === tok.type && !tok.tokens) tok.tokens = id;
            }
        }

        if (grammar.Parser) grammar.Parser = flatten(grammar.Parser);

        return grammar;
    }

    ,bckRef: function(token, Lex, Syntax, only_key, with_group) {
        var entry;
        // handle trivial, back-references,
        // i.e a single token trivialy referencing another single token and so on..
        // until finding a non-trivial reference or none
        if (null != with_group)
        {
            while ((T_STR & get_type(entry=Lex[token]||Syntax[token])) && (entry.group!=with_group)) token = entry;
        }
        else
        {
            while (T_STR & get_type(entry=Lex[token]||Syntax[token])) token = entry;
        }
        return only_key ? token : (Lex[token] || Syntax[token] || token);
    }

    ,parsePEG: function(tok, Lex, Syntax) {
        var self = this, alternation, sequence,
            token, literal, repeat, entry, prev_entry,
            t, c, fl, prev_token, curr_token, stack, tmp,
            named_group = false, group_preset;

        group_preset = ''===tok.group ? '' : (tok.group || null);
        t = new String(trim(tok)); t.pos = 0;

        if (1 === t.length)
        {
            curr_token = '' + tok;
            if (!Lex[curr_token] && !Syntax[curr_token]) Lex[curr_token] = {type:'simple', tokens:tok};
            tok = curr_token;
        }
        else
        {
            // parse PEG/BNF-like shorthand notations for syntax groups
            alternation = []; sequence = [];
            token = ''; stack = [];
            while (t.pos < t.length)
            {
                c = t[CHAR](t.pos++);

                if (peg_bnf_special_re.test(c))
                {
                    if (named_group && !token.length) token = ' '; // nameless group

                    if (token.length)
                    {
                        if (named_group)
                        {
                            token = trim(token);
                            // interpret as named_group / group / decorator
                            if (sequence.length)
                            {
                                prev_token = sequence[sequence.length-1];
                                curr_token  = prev_token + '.' + token;
                                entry = Lex[curr_token] || Syntax[curr_token];
                                if (!entry)
                                {
                                    prev_entry = self.bckRef(prev_token, Lex, Syntax);
                                    // in case it is just string, wrap it, to maintain the named_group reference
                                    Syntax[curr_token] = T_STR & get_type(prev_entry)
                                                        ? new String(prev_entry)
                                                        : clone(prev_entry);
                                    Syntax[curr_token].group = token;
                                    entry = Syntax[curr_token];
                                }
                                sequence[sequence.length-1] = curr_token;
                            }
                            named_group = false;
                        }
                        else if ('0' === token)
                        {
                            // interpret as empty tokenizer
                            if (!Lex[$T_EMPTY$]) Lex[$T_EMPTY$] = {type:'simple', tokens:0/*T_EMPTY*/};
                            sequence.push($T_EMPTY$);
                        }
                        else if ('^^' === token)
                        {
                            // interpret as SOF tokenizer
                            if (!Lex[$T_SOF$]) Lex[$T_SOF$] = {type:'simple', tokens:T_SOF};
                            sequence.push($T_SOF$);
                        }
                        else if ('^^1' === token)
                        {
                            // interpret as FNBL tokenizer
                            if (!Lex[$T_FNBL$]) Lex[$T_FNBL$] = {type:'simple', tokens:T_FNBL};
                            sequence.push($T_FNBL$);
                        }
                        else if ('^' === token)
                        {
                            // interpret as SOL tokenizer
                            if (!Lex[$T_SOL$]) Lex[$T_SOL$] = {type:'simple', tokens:T_SOL};
                            sequence.push($T_SOL$);
                        }
                        else if ('$' === token)
                        {
                            // interpret as EOL tokenizer
                            if (!Lex[$T_EOL$]) Lex[$T_EOL$] = {type:'simple', tokens:T_EOL};
                            sequence.push($T_EOL$);
                        }
                        else
                        {
                            if (!Lex[token] && !Syntax[token]) Lex[token] = {type:'simple', tokens:token};
                            sequence.push(token);
                        }
                        token = '';
                    }

                    if ('.' === c /*|| ':' === c*/)
                    {
                        // a dot by itself, not specifying a named_group
                        if (sequence.length /*&& t.pos < t.length &&
                            (' '===t[CHAR](t.pos) || !peg_bnf_special_re.test(t[CHAR](t.pos)))*/) named_group = true;
                        else token += c;
                    }

                    else if (('"' === c) || ('\'' === c))
                    {
                        // literal token, quoted
                        literal = get_delimited(t, c, '\\', 1);
                        if (literal.length)
                        {
                            curr_token = "'" + literal + "'";
                            if (!Lex[curr_token]) Lex[curr_token] = {type:'simple', tokens:literal};
                            sequence.push(curr_token);
                        }
                        else
                        {
                            // interpret as non-space tokenizer
                            if (!Lex[$T_NONSPACE$]) Lex[$T_NONSPACE$] = {type:'simple', tokens:''};
                            sequence.push($T_NONSPACE$);
                        }
                    }

                    else if ('[' === c)
                    {
                        // start of character select
                        /*if ( !token.length )
                        {*/
                        c = t[CHAR](t.pos+1);
                        if ('^' === c) t.pos++;
                        else c = '';
                        literal = get_delimited(t, ']', '\\', 0);
                        curr_token = '[' + c+literal + ']';
                        if (!Lex[curr_token])
                            Lex[curr_token] = {
                                type:'simple',
                                tokens:new_re("^(["+c+/*esc_re(*/literal/*)*/+"])")
                                //                                          negative match,      else   positive match
                            /*literal.split('')*/};
                        sequence.push(curr_token);
                        /*}
                        else token += c;*/
                    }

                    else if (']' === c)
                    {
                        // end of character select, should be handled in previous case
                        // added here just for completeness
                        token += c;
                        continue;
                    }

                    else if ('/' === c)
                    {
                        // literal regex token
                        /*if ( !token.length )
                        {*/
                        literal = get_delimited(t, c, '\\', 0); fl = '';
                        if (literal.length)
                        {
                            if (t.pos < t.length && 'i' === t[CHAR](t.pos)) {t.pos++; fl = 'i';}
                            curr_token = '/' + literal + '/' + fl;
                            if (!Lex[curr_token]) Lex[curr_token] = {type:'simple', tokens:new_re("^("+literal+")",{l:0,x:0,i:'i'===fl})};
                            sequence.push(curr_token);
                        }
                        /*}
                        else token += c;*/
                    }

                    else if (('*' === c) || ('+' === c) || ('?' === c))
                    {
                        // repeat modifier, applies to token that comes before
                        if (sequence.length)
                        {
                            prev_token = sequence[sequence.length-1];
                            curr_token = '' + prev_token + c;
                            if (!Syntax[curr_token])
                                Syntax[curr_token] = {
                                    type:'*' === c ? 'zeroOrMore' : ('+' === c ? 'oneOrMore' : 'zeroOrOne'),
                                    tokens:[prev_token]
                                };
                            sequence[sequence.length-1] = curr_token;
                        }
                        else token += c;
                    }

                    else if ((';' === c))
                    {
                        // (list) separator modifier, applies to (simple) token that comes before
                        if (sequence.length)
                        {
                            prev_token = sequence[sequence.length-1];
                            curr_token = '' + prev_token + c;
                            if (!Lex[curr_token])
                            {
                                Lex[curr_token] = Lex[prev_token] ? clone(Lex[prev_token]) : {type:'simple',tokens:prev_token};
                                Lex[curr_token].sep = 1;
                            }
                            sequence[sequence.length-1] = curr_token;
                        }
                        else token += c;
                    }

                    else if ('{' === c)
                    {
                        // literal repeat modifier, applies to token that comes before
                        if (sequence.length)
                        {
                            repeat = get_delimited(t, '}', 0, 0);
                            repeat = repeat.split(',').map(trim);

                            if (!repeat[0].length) repeat[0] = 0; // {,m} match 0 times or more
                            else repeat[0] = parseInt(repeat[0], 10) || 0;// {n,m} match n times up to m times
                            if (0 > repeat[0]) repeat[0] = 0;

                            if (2 > repeat.length) repeat.push(repeat[0]); // {n} match exactly n times
                            else if (!repeat[1].length) repeat[1] = INF; // {n,} match n times or more (INF)
                            else repeat[1] = parseInt(repeat[1], 10) || INF; // {n,m} match n times up to m times
                            if (0 > repeat[1]) repeat[1] = 0;

                            prev_token = sequence[sequence.length-1];
                            curr_token = '' + prev_token + [
                                '{',
                                repeat[0],
                                ',',
                                isFinite(repeat[1]) ? repeat[1] : '',
                                '}'
                            ].join('');
                            if (!Syntax[curr_token])
                                Syntax[curr_token] = {type:'repeat', repeat:[repeat[0], repeat[1]], tokens:[prev_token]}
                            sequence[sequence.length-1] = curr_token;
                        }
                        else token += c;
                    }

                    else if ('}' === c)
                    {
                        // literal repeat end modifier, should be handled in previous case
                        // added here just for completeness
                        token += c;
                        continue;
                    }

                    else if (('&' === c) || ('!' === c))
                    {
                        // lookahead modifier, applies to token that comes before
                        if (sequence.length)
                        {
                            prev_token = sequence[sequence.length-1];
                            curr_token = '' + prev_token + c;
                            if (!Syntax[curr_token])
                                Syntax[curr_token] = {
                                    type:'!' === c ? 'negativeLookahead' : 'positiveLookahead',
                                    tokens:[prev_token]
                                };
                            sequence[sequence.length-1] = curr_token;
                        }
                        else token += c;
                    }

                    else if ('|' === c)
                    {
                        named_group = false;
                        // alternation
                        if (sequence.length > 1)
                        {
                            curr_token = '' + sequence.join(' ');
                            if (!Syntax[curr_token]) Syntax[curr_token] = {type:'sequence', tokens:sequence};
                            alternation.push(curr_token);
                        }
                        else if (sequence.length)
                        {
                            alternation.push(sequence[0]);
                        }
                        else
                        {
                            token += c;
                        }
                        sequence = [];
                    }

                    else if ('(' === c)
                    {
                        // start of grouped sub-sequence
                        stack.push([sequence, alternation, token]);
                        sequence = []; alternation = []; token = '';
                    }

                    else if (')' === c)
                    {
                        // end of grouped sub-sequence
                        if (sequence.length > 1)
                        {
                            curr_token = '' + sequence.join(' ');
                            if (!Syntax[curr_token]) Syntax[curr_token] = {type:'sequence', tokens:sequence};
                            alternation.push(curr_token);
                        }
                        else if (sequence.length)
                        {
                            alternation.push( sequence[0] );
                        }
                        sequence = [];

                        if (alternation.length > 1)
                        {
                            curr_token = '' + alternation.join(" | ");
                            if (!Syntax[curr_token]) Syntax[curr_token] = {type:'alternation', tokens:alternation};
                        }
                        else if (alternation.length)
                        {
                            curr_token = alternation[0];
                        }
                        alternation = [];

                        tmp = stack.pop();
                        sequence = tmp[0]; alternation = tmp[1]; token = tmp[2];

                        prev_token = curr_token;
                        curr_token = '(' + prev_token + ')';
                        if (!Syntax[curr_token]) Syntax[curr_token] = clone(self.bckRef(prev_token, Lex, Syntax));
                        sequence.push(curr_token);
                    }

                    else // space
                    {
                        // space separator, i.e sequence of tokens
                        //continue;
                    }
                }
                else
                {
                    token += c;
                }
            }

            if (named_group && !token.length) token = ' '; // nameless group

            if (token.length)
            {
                if (named_group)
                {
                    token = trim(token);
                    // interpret as named_group / group / decorator
                    if (sequence.length)
                    {
                        prev_token = sequence[sequence.length-1];
                        curr_token  = prev_token + '.' + token;
                        entry = Lex[curr_token] || Syntax[curr_token];
                        if (!entry)
                        {
                            // in case it is just string, wrap it, to maintain the named_group reference
                            prev_entry = self.bckRef(prev_token, Lex, Syntax);
                            Syntax[curr_token] = T_STR & get_type(prev_entry)
                                                ? new String(prev_entry)
                                                : clone(prev_entry);
                            Syntax[curr_token].group = token;
                            entry = Syntax[curr_token];
                        }
                        sequence[sequence.length-1] = curr_token;
                    }
                    named_group = false;
                }
                else if ('0' === token)
                {
                    // interpret as empty tokenizer
                    if (!Lex[$T_EMPTY$]) Lex[$T_EMPTY$] = {type:'simple', tokens:0/*T_EMPTY*/};
                    sequence.push($T_EMPTY$);
                }
                else if ('^^' === token)
                {
                    // interpret as SOF tokenizer
                    if (!Lex[$T_SOF$]) Lex[$T_SOF$] = {type:'simple', tokens:T_SOF};
                    sequence.push($T_SOF$);
                }
                else if ('^^1' === token)
                {
                    // interpret as FNBL tokenizer
                    if (!Lex[$T_FNBL$]) Lex[$T_FNBL$] = {type:'simple', tokens:T_FNBL};
                    sequence.push($T_FNBL$);
                }
                else if ('^' === token)
                {
                    // interpret as SOL tokenizer
                    if (!Lex[$T_SOL$]) Lex[$T_SOL$] = {type:'simple', tokens:T_SOL};
                    sequence.push($T_SOL$);
                }
                else if ('$' === token)
                {
                    // interpret as EOL tokenizer
                    if (!Lex[$T_EOL$]) Lex[$T_EOL$] = {type:'simple', tokens:T_EOL};
                    sequence.push($T_EOL$);
                }
                else
                {
                    if (!Lex[token] && !Syntax[token]) Lex[token] = {type:'simple', tokens:token};
                    sequence.push(token);
                }
            }
            token = '';

            if (sequence.length > 1)
            {
                curr_token = '' + sequence.join(" ");
                if (!Syntax[curr_token]) Syntax[curr_token] = {type:'sequence', tokens:sequence};
                alternation.push(curr_token);
            }
            else if (sequence.length)
            {
                alternation.push(sequence[0]);
            }
            else
            {
                // ??
            }
            sequence = [];

            if (alternation.length > 1)
            {
                curr_token = '' + alternation.join(' | ');
                if (!Syntax[curr_token]) Syntax[curr_token] = {type:'alternation', tokens:alternation};
                tok = curr_token;
            }
            else if (alternation.length)
            {
                tok = alternation[0];
            }
            else
            {
                // ??
            }
            alternation = [];
        }
        if ((null != group_preset) && (Lex[tok]||Syntax[tok])) (Lex[tok]||Syntax[tok]).group = group_preset;
        return tok;
    }

    ,parse: function() {
        var self = this, grammar = self.$json, RegExpID,
            Extra, Lex, Syntax,
            cachedRegexes, cachedMatchers, cachedTokens,
            interleavedTokens, comments;

        if (null != self.$obj) return self;

        RegExpID = grammar.RegExpID || null;
        Lex = grammar.Lex ? clone(grammar.Lex) : {};
        Syntax = grammar.Syntax ? clone(grammar.Syntax) : {};

        cachedRegexes = {}; cachedMatchers = {}; cachedTokens = {};
        comments = {}; interleavedTokens = [];

        grammar = self.preprocess({
            Lex             : Lex,
            Syntax          : Syntax,
            Parser          : grammar.Parser ? make_array(grammar.Parser) : [],
            $spc            : false === grammar.Space ? false : (null != grammar.Space ? Parser.Grammar.RE(grammar.Space, RegExpID, {}, '').re : Parser.Stream.$SPC$),
            $nspc           : null != grammar.NonSpace ? Parser.Grammar.RE(grammar.NonSpace, RegExpID, {}, '').re : Parser.Stream.$NONSPC$,
            $parser         : null,
            $interleaved    : null,
            $comments       : null
        });

        grammar.$parser = grammar.Parser.reduce(function(tokens, tokenID) {
            var token = self.tokenizer(tokenID, RegExpID, Lex, Syntax, cachedRegexes, cachedMatchers, cachedTokens, interleavedTokens, comments) || null;
            if (token)
            {
                if (T_ARRAY & get_type(token)) tokens = tokens.concat(token);
                else tokens.push(token);
            }
            return tokens;
        }, []);
        grammar.$interleaved = interleavedTokens&&interleavedTokens.length ? interleavedTokens : null;
        grammar.$comments = comments;

        self.$obj = grammar;
        return self;
    }
};

function Parser(grammar)
{
    var self = this;
    if (!(self instanceof Parser)) return new Parser(grammar);
    self.$grammar = grammar instanceof Parser.Grammar ? grammar : new Parser.Grammar(grammar);
    self.$grammar.parse();
    self.$subgrammars = {};
}
Parser[PROTO] = {
    constructor: Parser

    ,$grammar: null
    ,$subgrammars: null

    ,dispose: function() {
        var self = this;
        if (self.$grammar) self.$grammar.dispose();
        self.$grammar = self.$subgrammars = null;
        return self;
    }

    ,err: function(state, l0, c0, l1, c1, tokenizer) {
        return state.error(l0, c0, l1, c1, tokenizer);
    }

    ,tok: function(stream, state, inner, options) {
        var self = this, grammar = self.$grammar.$obj, T,
            interleaved_tokens = grammar.$interleaved, tokens = grammar.$parser,
            nTokens = tokens.length, niTokens = interleaved_tokens ? interleaved_tokens.length : 0,
            tokenizer, token, line, pos, i, ii, stream_pos, stack_pos, ast_part,
            ret, err, notfound, just_space, foundInterleaved, alt,
            outer = state.outer, subgrammar, innerParser, innerState,
            outerState = outer && outer[2], outerTokenizer = outer && outer[1]
        ;

        if (state.token2)
        {
            // already parsed token in previous run
            T = state.token2[0];
            stream.pos = state.token2[1]; stream.sft();
            state.token = state.token2[3];
            state.$eol$ = stream.eol();
            state.$blank$ = state.$blank$ && (state.token2[2] || state.$eol$);
            state.token2 = null;
            return T;
        }

        // state marks a new line
        if (stream.sol())
        {
            if (state.$eol$)
            {
                // update count of blank lines at start of file
                if (state.$blank$) state.bline = stream.line;
                state.$eol$ = false;
            }
            state.$blank$ = (state.bline+1 === stream.line);
        }

        token = new Parser.Token(); T = null; ret = new Parser.Result(false);
        line = stream.line; pos = stream.pos;
        notfound = true; err = false; just_space = false;
        state.token = null;

        if (outer && (self === outer[0]))
        {
            // use self mode as default passthru INNER mode
            // check if need to dispatch back to outer parser
            if (outerTokenizer)
            {
                if (false !== outerTokenizer.tokenize(stream, outerState, token, options).type)
                {
                    if (false === self.fin(stream, state, options)) return false;
                    state.outer = null;
                    if (outer[3] && outer[3].length && KEYS(state.ast).length) outerState.ast[outer[3]] = state.ast;
                    return {parser: self, state: outerState};
                }
                else
                {
                    stream.nxt(1/*true*/);
                }
                while (!stream.eol())
                {
                    if (false !== outerTokenizer.tokenize(stream, outerState, token, options).type)
                    {
                        if (stream.pos > pos)
                        {
                            // return current token first
                            break;
                        }
                        else
                        {
                            if (false === self.fin(stream, state, options)) return false;
                            state.outer = null;
                            if (outer[3] && outer[3].length)
                            {
                                if (options.partialMatch)
                                    outerState.ast[outer[3]] = state.matches;
                                else if (KEYS(state.ast).length)
                                    outerState.ast[outer[3]] = state.ast;
                            }
                            return {parser: self, state: outerState};
                        }
                    }
                    else
                    {
                        stream.nxt(1/*true*/);
                    }
                }
            }
            else
            {
                // pass whole line through
                stream.spc();
                if (stream.eol()) just_space = true;
                else stream.end();
            }

            T = stream.cur(1);
            state.$eol$ = stream.eol();
            state.$blank$ = state.$blank$ && (just_space || state.$eol$);
            return T;
        }

        // check for partial-block-in-progress, or matching tokenizer before parsing any space/empty
        if ((!state.stack || (null == state.block)) && stream.spc())
        {
            stream.start = pos;
            T = stream.cur(1);
            if (options.includeSpace)
            {
                ast_part = {
                    space: true,
                    token: T,
                    match: T,
                    from: {
                        line: line,
                        pos: pos,
                        index: stream.ind(pos)
                    },
                    to: {
                        line: line,
                        pos: stream.pos,
                        index: stream.ind(stream.pos)
                    }
                };
                if (HAS.call(state.ast, options.includeSpace))
                {
                    if (T_ARRAY !== get_type(state.ast[options.includeSpace])) state.ast[options.includeSpace] = [state.ast[options.includeSpace]];
                    state.ast[options.includeSpace].push(ast_part);
                }
                else
                {
                    state.ast[options.includeSpace] = ast_part;
                }
            }
            state.$eol$ = stream.eol();
            state.$blank$ = state.$blank$ && (just_space || state.$eol$);
            return T;
        }

        i = 0;
        while (notfound && (state.stack || (options.partialMatch && i<nTokens)) && !stream.eol())
        {
            stream_pos = stream.pos; stack_pos = state.stack;

            // check for outer parser interleaved
            if (outerTokenizer)
            {
                stream.spc();
                if (false !== outerTokenizer.tokenize(stream, outerState, token, options).type)
                {
                    if (token.space || (stream.pos > stream_pos))
                    {
                        // match the spaces first
                        if (token.space)
                        {
                            stream.start = token.space[0];
                            stream.pos = token.space[1];
                        }
                        T = stream.cur(1);
                        if (options.includeSpace)
                        {
                            ast_part = {
                                space: true,
                                token: T,
                                match: T,
                                from: {
                                    line: line,
                                    pos: stream_pos,
                                    index: stream.ind(stream_pos)
                                },
                                to: {
                                    line: line,
                                    pos: stream.pos,
                                    index: stream.ind(stream.pos)
                                }
                            };
                            if (HAS.call(state.ast, options.includeSpace))
                            {
                                if (T_ARRAY !== get_type(state.ast[options.includeSpace])) state.ast[options.includeSpace] = [state.ast[options.includeSpace]];
                                state.ast[options.includeSpace].push(ast_part);
                            }
                            else
                            {
                                state.ast[options.includeSpace] = ast_part;
                            }
                        }
                        state.$eol$ = stream.eol();
                        state.$blank$ = state.$blank$ && (true || state.$eol$);
                        return T;
                    }
                    else
                    {
                        // dispatch back to outer parser
                        if (false === self.fin(stream, state, options)) return false;
                        state.outer = null;
                        if (outer[3] && outer[3].length)
                        {
                            if (options.partialMatch) outerState.ast[outer[3]] = state.matches;
                            else if (KEYS(state.ast).length) outerState.ast[outer[3]] = state.ast;
                        }
                        return {parser: outer[0], state: outerState, fromInner: state};
                    }
                }
                stream.bck(stream_pos);
            }

            // dont interleave tokens if partial block is in progress
            foundInterleaved = false;
            if (niTokens && !state.block)
            {
                for (ii=0; ii<niTokens; ++ii)
                {
                    tokenizer = interleaved_tokens[ii];
                    ret = tokenizer.tokenize(stream, state, token, options);
                    if (false !== ret.type) {foundInterleaved = true; break;}
                }
            }

            if (notfound && !foundInterleaved)
            {
                if (!state.stack && (!options.partialMatch || i>=nTokens))
                {
                    tokenizer = null;
                    break;
                }
                if (state.stack)
                {
                    tokenizer = state.stack.val;
                    state.stack = state.stack.prev;
                }
                else if (options.partialMatch)
                {
                    self.fin(stream, state, options);
                    state.stream = [stream.pos, stream.line, stream.start];
                    tokenizer = tokens[i++];
                }
                ret = tokenizer.tokenize(stream, state, token, options);
            }

            // match failed
            if (false === ret.type)
            {
                // error
                if (tokenizer.status & REQUIRED)
                {
                    if (state.alt)
                    {
                        // there are alternatives waiting, try them
                        alt = state.alt.val; state.alt = state.alt.prev;
                        state.backup(stream, alt.state, true);
                        state.pushAt(state.stack, alt.tokenizer);
                        continue;
                    }
                    if (options.partialMatch)
                    {
                        //self.fin(stream, state, options);
                        state.stack = null;
                        if (state.stream)
                        {
                            stream.bck(state.stream[0], state.stream[1], state.stream[2]);
                            state.stream = null;
                            stream.pass(stream.pos, 1, 1);
                        }
                        else
                        {
                            stream.pass(pos, 1, 1);
                        }
                        return stream.cur(1);
                    }
                    else if (options.ignoreErrors)
                    {
                        stream.pass(pos, 1, 1);
                        return stream.cur(1);
                    }
                    else
                    {
                        self.err(state, line, pos, stream.line, stream.pos, tokenizer);
                        return false;
                    }
                }
            }
            // found token
            else
            {
                // subgrammar inner parser
                if (ret.data.subgrammar)
                {
                    // dispatch to inner sub-parser
                    subgrammar = String(ret.type);
                    if (!self.$subgrammars[subgrammar])
                    {
                        // use self as default passthru inner parser
                        innerParser = self;
                        innerState = new Parser.State();
                        outerState = state;
                    }
                    else
                    {
                        // use actual inner sub-grammar parser
                        innerParser = self.$subgrammars[subgrammar];
                        innerState = new Parser.State(0, /*inner[subgrammar] ? inner[subgrammar] : */state.status);
                        if (options.partialMatch)
                            innerState.matches = [];
                        else
                            innerState.pushAt(innerState.stack, innerParser.$grammar.$obj.$parser[0]);
                        outerState = state;
                    }
                    innerState.outer = [self, ret.data.next, outerState, ''===ret.data.group ? ret.data.group : (ret.data.group || ret.data.name)];
                    if (token.space)
                    {
                        // match the spaces first
                        state.token2 = [{parser: innerParser, state: innerState, toInner: subgrammar}, stream.pos, just_space, state.token];
                        state.token = null;
                        stream.start = token.space[0];
                        stream.pos = token.space[1];
                        T = stream.cur(1);
                        if (options.includeSpace)
                        {
                            ast_part = {
                                space: true,
                                token: T,
                                match: T,
                                from: {
                                    line: line,
                                    pos: pos,
                                    index: stream.ind(pos)
                                },
                                to: {
                                    line: line,
                                    pos: stream.pos,
                                    index: stream.ind(stream.pos)
                                }
                            };
                            if (HAS.call(state.ast, options.includeSpace))
                            {
                                if (T_ARRAY !== get_type(state.ast[options.includeSpace])) state.ast[options.includeSpace] = [state.ast[options.includeSpace]];
                                state.ast[options.includeSpace].push(ast_part);
                            }
                            else
                            {
                                state.ast[options.includeSpace] = ast_part;
                            }
                        }
                        state.$eol$ = stream.eol();
                        state.$blank$ = state.$blank$ && (true || state.$eol$);
                        return T;
                    }
                    else
                    {
                        return {parser: innerParser, state: innerState, toInner: subgrammar};
                    }
                }
                // not empty
                /*if (true !== type) {*/notfound = false; break;/*}*/
            }
        }

        // unknown
        if (notfound || !tokenizer)
        {
            /*if (token.space)
            {
                // return the spaces first
                state.token2 = [T, stream.pos, just_space, state.token];
                state.token = null;
                stream.start = token.space[0];
                stream.pos = token.space[1];
                T = stream.cur(1);
                if (options.includeSpace)
                {
                    ast_part = {
                        space: true,
                        token: T,
                        match: T,
                        from: {
                            line: line,
                            pos: pos,
                            index: stream.ind(pos)
                        },
                        to: {
                            line: line,
                            pos: stream.pos,
                            index: stream.ind(stream.pos)
                        }
                    };
                    if (HAS.call(state.ast, options.includeSpace))
                    {
                        if (T_ARRAY !== get_type(state.ast[options.includeSpace])) state.ast[options.includeSpace] = [state.ast[options.includeSpace]];
                        state.ast[options.includeSpace].push(ast_part);
                    }
                    else
                    {
                        state.ast[options.includeSpace] = ast_part;
                    }
                }
                T = null;
            }
            else*/ if (options.ignoreErrors || options.partialMatch)
            {
                if (just_space)
                {
                    T = stream.cur(1);
                }
                else
                {
                    stream.nxt(true);
                    T = stream.cur(1);
                }
            }
            else
            {
                T = just_space ? stream.cur(1) : false;
            }
        }
        else
        {
            T = stream.cur(1); //type;
        }
        state.$eol$ = stream.eol();
        state.$blank$ = state.$blank$ && (just_space || state.$eol$);
        return T;
    }

    // parse any stack remainder and complete
    ,fin: function(stream, state, options) {
        var self = this, token, ast, line, pos, start, ret, tokenizer = null, err = false;
        token = new Parser.Token();
        line = stream.line; pos = stream.pos; start = stream.start;
        while (state.stack)
        {
            tokenizer = state.stack.val; state.stack = state.stack.prev;
            ret = tokenizer.tokenize(stream, state, token, options);
            if ((false === ret.type) && (tokenizer.status & REQUIRED))
            {
                err = true;
                if (!options.ignoreErrors && !options.partialMatch)
                {
                    self.err(state, line, pos, stream.line, stream.pos, tokenizer);
                    return false;
                }
            }
        }
        stream.bck(pos, line, start);
        if (options.partialMatch)
        {
            if (err && state.stream)
            {
                stream.bck(state.stream[0], state.stream[1], state.stream[2]);
                state.stream = null;
            }
            else if ((options.ignoreErrors || !err) && KEYS(state.ast).length)
            {
                state.matches.push(state.ast);
            }
            state.clean();
        }
        return true;
    }

    // get token via multiplexing inner grammars if needed
    ,get: function(stream, mode, options) {
        var ret = mode.parser.tok(stream, mode.state, mode.inner, options);
        while (ret && ret.parser)
        {
            // multiplex inner grammar/parser/state if given
            // save inner parser current state
            if (ret.fromInner && (mode.parser !== ret.parser))
            {
                mode.state.err = ret.fromInner.err;
                if (mode.name) mode.inner[mode.name] = ret.fromInner;
            }
            // share some state
            ret.state.err = mode.state.err;
            ret.state.bline = mode.state.bline;
            ret.state.$blank$ = mode.state.$blank$;
            ret.state.$eol$ = mode.state.$eol$;
            // update parser to current parser and associated state
            mode.state = ret.state;
            mode.parser = ret.parser;
            mode.name = ret.toInner;
            // adjust stream space settings from associated grammar
            stream.space_re = mode.parser.$grammar.$obj.$spc;
            stream.non_space_re = mode.parser.$grammar.$obj.$nspc;
            // get new token
            ret = mode.parser.tok(stream, mode.state, mode.inner, options);
        }
        // return token
        return ret;
    }

    ,error: function(state) {
        var err = state.err, errors = [], e;
        if (err)
        {
            for (e in err)
            {
                if (!HAS.call(err, e)) continue;
                errors.push(err[e][4] + ' (at line:'+(err[e][0]+1)+', pos:'+(err[e][1]+1)+')');
            }
        }
        return errors;
    }

    ,parse: function(text, options) {
        var self = this, stream, mode, token, ast;

        stream = new Parser.Stream(text, self.$grammar.$obj.$spc, self.$grammar.$obj.$nspc);
        mode = {parser: self, state: new Parser.State( 0, options.ignoreErrors || options.partialMatch ? 0 : ERRORS ), inner: {}};
        if (options.partialMatch)
            mode.state.matches = [];
        else
            mode.state.pushAt(mode.state.stack, self.$grammar.$obj.$parser[0]);

        stream.lin();
        while (!stream.eof())
        {
            if (stream.eol())
            {
                if (mode.state.$blank$) ++mode.state.bline;
            }
            else while (!stream.eol())
            {
                token = mode.parser.get(stream, mode, options);
                // error
                if (false === token) return self.error(mode.state);
            }
            stream.lin();

            if (stream.eof())
            {
                // parse stack remainder
                token = mode.parser.fin(stream, mode.state, options);
                // error
                if (false === token) return self.error(mode.state);

                if (options.partialMatch && !stream.eof())
                {
                    // stream has been moved back
                    stream.pass(stream.pos, 1, 1);
                    token = stream.cur(1);
                }
            }
        }

        ast = options.partialMatch ? mode.state.matches : mode.state.ast;
        mode.state.dispose();
        mode = null;
        return ast;
    }

    ,sub: function(name, parser) {
        var self = this;
        if (false === parser)
        {
            // remove
            if (HAS.call(self.$subgrammars,name))
                delete self.$subgrammars[name];
        }
        else if (parser)
        {
            // add
            self.$subgrammars[name] = parser instanceof Parser ? parser : new Parser(parser);
        }
        return self;
    }
};
Parser.Stack = Stack;
Parser.State = State;
Parser.Stream = Stream;
Parser.Token = Token;
Parser.Result = Result;
Parser.Matcher = Matcher;
Parser.Tokenizer = Tokenizer;
Parser.Grammar = Grammar;

function GrammarTree(grammar)
{
    var self = this;
    if (!(self instanceof GrammarTree)) return new GrammarTree(grammar);
    grammar = grammar || {Lex:{},Syntax:{}};
    // lazy init
    self.$grammar = grammar;
}
GrammarTree[PROTO] = {
    constructor: GrammarTree

    ,$grammar: false
    ,$parser: null

    ,dispose: function() {
        var self = this;
        if (self.$parser) self.$parser.dispose();
        self.$grammar = null;
        self.$parser = null;
        return self;
    }

    ,init: function() {
        var self = this;
        // lazy init
        if (!self.$parser && self.$grammar)
            self.$parser = new GrammarTree.Parser(self.$grammar);
        return self;
    }

    ,sub: function(name, grammar) {
        var self = this;
        self.init().$parser.sub(name, grammar instanceof GrammarTree ? grammar.init().$parser : grammar);
        return self;
    }

    ,get: function(text, opts) {
        var self = this;
        opts = merge({
            ignoreErrors: false,
            partialMatch: false,
            includeSpace: false
        }, opts||{});
        if (opts.includeSpace) opts.includeSpace = String(opts.includeSpace);
        return self.init().$parser.parse(text, opts);
    }
};
GrammarTree.VERSION = '0.9.0';
GrammarTree.Parser = Parser;

// export it
return GrammarTree;
});
