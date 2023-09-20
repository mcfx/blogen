/*
Language: move
Author: Yusong Wang <admin@wangyusong.com>
Contributors: Yusong Wang <admin@wangyusong.com>
Website: 
Category: common
From: https://github.com/movefuns/highlightjs-move
*/

/** @type LanguageFn */
function moveGram(hljs) {
    const KEYWORDS = [
      "abort",
      "acquires",
      "has",
      "as",
      "break",
      "continue",
      "copy",
      "drop",
      "key",
      "mut",
      "store",
      "define",
      "else",
      "false",
      "fun",
      "if",
      "invariant",
      "let",
      "loop",
      "module",
      "entry",
      "move",
      "native",
      "public",
      "const",
      "return",
      "spec",
      "struct",
      "true",
      "use",
      "while",
      "script",
      "friend",
      "address",
    ];
  
    const LITERALS = ["true", "false"];
  
    const BUILTINS = [
      "move_to_sender",
      "emit_event",
      "emit",
      "borrow_global_mut",
      "has",
      "assert",
      "borrow_global",
      "exists",
      "freeze",
      "move_from",
      "move_to",
      "old",
      "transfer",
      "public_transfer",
      "freeze_object",
      "public_freeze_object",
      "share_object",
      "public_share_object",
    ];
  
    const TYPES = ["u8", "u16", "u32", "u64", "u128", "u256", "bool", "vector"];
  
    return {
      name: "move",
      aliases: ["move"],
      keywords: {
        $pattern: hljs.IDENT_RE + "!?",
        type: TYPES,
        keyword: KEYWORDS,
        literal: LITERALS,
        built_in: BUILTINS,
      },
      illegal: "</",
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.COMMENT("/\\*", "\\*/", { contains: ["self"] }),
        hljs.inherit(hljs.QUOTE_STRING_MODE, {
          begin: /b?"/,
          illegal: null,
        }),
        {
          className: "string",
          variants: [
            { begin: /r(#*)"(.|\n)*?"\1(?!#)/ },
            { begin: /b?'\\?(x\w{2}|u\w{4}|U\w{8}|.)'/ },
          ],
        },
        { className: "symbol", begin: /'[a-zA-Z_][a-zA-Z0-9_]*/ },
        {
          className: "number",
          variants: [
            { begin: "\\b0x([A-Fa-f0-9_]+)" },
            { begin: "\\b([0-9]+)(u(8|64|128))?" },
          ],
          relevance: 0,
        },
        {
          className: "function",
          beginKeywords: "fun",
          end: "(\\(|<)",
          excludeEnd: !0,
          contains: [hljs.UNDERSCORE_TITLE_MODE],
        },
        {
          className: "class",
          beginKeywords: "struct resource module",
          end: "{",
          contains: [
            hljs.inherit(hljs.UNDERSCORE_TITLE_MODE, { endsParent: !0 }),
          ],
          illegal: "[\\w\\d]",
        },
        {
          className: "punctuation",
          begin: ":",
        },
        { begin: hljs.IDENT_RE + "::", keywords: { built_in: BUILTINS } },
      ],
    };
  }

function regMove(hljs) {
    hljs.registerLanguage("move", moveGram);
}

module.exports = regMove;