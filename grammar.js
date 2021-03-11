// @ts-nocheck

const Pragma = /#[^\n]*/
const SqStr = /'[^']*'/
const DqStr = /"[^"]*"/
const Comment = /\/\*([^\*\/]|\*[^\/]|[^\*]\/)*\*\/|\/\/[^\n]*/
const Blank = /[ \t\r　]+/
const LF = /\n+/
const Int = /\-?0[xX][0-9A-Fa-f]+|\-?0[oO][0-7]+|\-?0[bB][01]+|\-?\d[\d_]*/
const Float = /\-?\d+(\.\d+)?[Ee][\+\-]?\d+|\-?\d+\.\d+/
const Char = /`.|\\u[0-9A-Fa-f]+|\\[a-z]/
const Name = /[^0-9\{\}\[\]\(\)\.,:;\#\&\\'"` \t\r　\n][^\{\}\[\]\(\)\.,:;\#\&\\'"` \t\r　\n]*/

module.exports = grammar({
  name: 'kumachan',
  extras: $ => [$.comment, $.pragma, Blank, LF],
  rules: (raw => {
    let rules = {}
    for (let [k,v] of Object.entries(raw)) {
      let decorate = (g, f) => $ => f(g($)) 
      if (k == 'inline_type_args' || k == 'inline_ref') {
        v = decorate(v, x => prec.left(x))
      } else {
        v = decorate(v, x => prec.right(x))
      }
      rules[k] = v
    }
    return rules
  })({
      source_file: $ => $.stmts,
        stmts: $ => repeat1($.stmt),
          stmt: $ => choice($.import, $.do, $.decl_type, $.decl_const, $.decl_func),
            import: $ => seq('import', $.name, 'from', $.string_text, ';'),
              name: $ => Name,
            do: $ => seq('do', $.expr, ';'),
      type: $ => choice($.type_literal, $.type_ref),
        type_ref: $ => seq(optional($.module_prefix), $.name, optional($.type_args)),
          module_prefix: $ => choice(seq($.name, '::'), '::'),
          type_args: $ => seq('[', $.type, repeat(seq(',', $.type)), ']'),
        type_literal: $ => $.repr,
          repr: $ => choice($.repr_func, $.repr_tuple, $.repr_bundle),
            repr_tuple: $ => choice(seq('(', ')'), seq('(', $.type, repeat(seq(',', $.type)), ')')),
            repr_bundle: $ => choice(seq('{', '}'), seq('{', $.field, repeat(seq(',', $.field)), '}')),
              field: $ => seq($.name, ':', $.type),
            repr_func: $ => seq('&', $.input_type, '=>', $.output_type),
              input_type: $ => $.type,
              output_type: $ => $.type,
      decl_type: $ => seq('type', $.name, optional($.type_params), optional($.type_value), ';'),
        type_value: $ => choice($.native_type, $.implicit_type, $.enum_type, $.boxed_type),
          native_type: $ => 'native',
          implicit_type: $ => seq('implicit', $.repr_bundle),
          enum_type: $ => seq('enum', '{', repeat1($.decl_type), '}'),
          boxed_type: $ => seq(optional($.box_option), optional('weak'), $.inner_type),
            box_option: $ => choice('protected', 'opaque'),
            inner_type: $ => $.type,
        type_params: $ => seq('[', $.type_param, repeat(seq(',', $.type_param)), ']'),
          type_param: $ => seq(optional(seq('[', $.type, ']')), $.name, optional($.type_bound)),
            type_bound: $ => seq(choice('<', '>'), $.type),
      decl_func: $ => seq(optional('export'), 'function', $.name, ':', optional($.type_params), $.signature, optional($.body), ';'),
        signature: $ => seq(optional($.implicit_input), $.repr_func),
          implicit_input: $ => seq('(', $.type, repeat(seq(',', $.type)), ')'),
        body: $ => choice($.native, $.lambda),
          native: $ => seq('native', $.string_text),
          lambda: $ => seq('&', $.pattern, '=>', $.expr),
            pattern: $ => choice($.pattern_trivial, $.pattern_tuple, $.pattern_bundle),
              pattern_trivial: $ => $.name,
              pattern_tuple: $ => choice(seq('(', ')'), seq('(', $.name, repeat(seq(',', $.name)), ')')),
              pattern_bundle: $ => choice(seq('{', '}'), seq('{', $.name, optional(seq(':', $.name)), repeat(seq(',', $.name, optional(seq(':', $.name)))), '}')),
      decl_const: $ => seq(optional('export'), 'const', $.name, ':', $.type, optional($.const_value), ';'),
        const_value: $ => seq(':=', choice($.native, $.expr)),
        expr: $ => seq($.term, optional($.pipeline)),
          pipeline: $ => seq($.pipe, optional($.pipeline)),
            pipe: $ => choice($.pipe_func, $.pipe_get, $.pipe_cast),
              pipe_func: $ => seq('.', '{', $.callee, optional($.expr), '}'),
                callee: $ => seq($.expr),
              pipe_get: $ => seq('.', $.name),
              pipe_cast: $ => seq('.', '[', $.type, ']'),
        term: $ => choice (
          $.call, $.lambda, $.multi_switch, $.switch, $.if,
          $.block, $.cps, $.bundle, $.tuple, $.inline_ref,
          $.array, $.int, $.float, $.formatter, $.string, $.char),
          call: $ => choice($.call_prefix, $.call_infix),
            call_prefix: $ => seq('{', $.callee, $.expr, '}'),
            call_infix: $ => seq('(', $.infix_left, $.operator, $.infix_right, ')'),
              operator: $ => $.expr,
              infix_left: $ => $.expr,
              infix_right: $ => $.expr,
          multi_switch: $ => seq('select', '(', $.exprlist, ')', ':', $.multi_branch_list, 'end'),
            exprlist: $ => seq($.expr, repeat(seq(',', $.expr))),
            multi_branch_list: $ => repeat1(seq($.multi_branch, ',')),
              multi_branch: $ => seq($.multi_branch_key, ':', $.expr),
                multi_branch_key: $ => choice('default', seq('case', $.multi_ref, optional($.multi_pattern))),
                  multi_ref: $ => seq('[', $.type_ref_list, ']'),
                    type_ref_list: $ => seq($.type_ref, repeat(seq(',', $.type_ref))),
                    multi_pattern: $ => $.pattern_tuple,
          switch: $ => seq('switch', $.expr, ':', $.branch_list, 'end'),
            branch_list: $ => repeat1(seq($.branch, ',')),
              branch: $ => choice(seq('default', ':', $.expr), seq('case', $.type_ref, repeat(seq(',', $.type_ref)), optional($.pattern), ':', $.expr)),
          if: $ => seq('if', $.expr, ':', $.expr, ',', repeat($.elif), 'else', ':', $.expr),
            elif: $ => seq('elif', $.expr, ':', $.expr, ','),
          block: $ => seq($.binding, $.block_value),
            binding: $ => seq('let', $.pattern, optional($.binding_type), ':=', $.expr),
              binding_type: $ => seq(':', optional('rec'), $.type),
              block_value: $ => seq(',', $.expr),
          cps: $ => seq('&',  optional($.cps_binding), $.inline_ref, $.cps_input, ',', $.cps_output),
            cps_binding: $ => seq($.pattern, optional($.binding_type), ':='),
            cps_input: $ => $.expr,
            cps_output: $ => $.expr,
          bundle: $ => choice(seq('{', '}'), seq('{', optional($.update), $.pairlist, '}')),
            pairlist: $ => seq($.pair, repeat(seq(',', $.pair))),
              pair: $ => choice(seq($.name, ':', $.expr), $.name),
            update: $ => seq('...', $.expr, ','),
          tuple: $ => choice(seq('(', ')'), seq('(', $.exprlist, ')')),
          inline_ref: $ => seq(optional($.inline_module_prefix), $.name, optional($.inline_type_args)),
            inline_module_prefix: $ => seq($.name, '::'),
            inline_type_args: $ => seq(':::', '[', $.type, repeat(seq(',', $.type)), ']'),
          array: $ => choice(seq('[', ']'), seq('[', $.exprlist, ']')),
          int: $ => Int,
          float: $ => Float,
          formatter: $ => seq($.formatter_text, repeat(seq('..', $.formatter_part))),
            formatter_part: $ => choice($.formatter_text, $.char),
            formatter_text: $ => DqStr,
          string: $ => seq($.string_text, repeat(seq('..', $.string_part))),
            string_part: $ => choice($.string_text, $.char),
            string_text: $ => SqStr,
          char: $ => Char,
      comment: $ => Comment,
      pragma: $ => Pragma,
  })
});

