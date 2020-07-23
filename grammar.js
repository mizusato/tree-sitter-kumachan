const Pragma = /#[^\n]*/
const SqStr = /'[^']*'/
const DqStr = /"[^"]*"/
const Comment = /\/\*([^\*\/]|\*[^\/]|[^\*]\/)*\*\/|\/\/[^\n]*/
const Blank = /[ \t\r　]+/
const LF = /\n+/
const Int = /\-?0[xX][0-9A-Fa-f]+|\-?0[oO][0-7]+|\-?0[bB][01]+|\-?\d[\d_]*/
const Float = /\-?\d+(\.\d+)?[Ee][\+\-]?\d+|\-?\d+\.\d+/
const Char = /\^.|\\u[0-9A-Fa-f]+|\\[a-z]/
const Name = /[^0-9\{\}\[\]\(\)\.,:;\~\#\$\^\&\|\\'"` \t\r　\n][^\{\}\[\]\(\)\.,:;\~\#\$\^\&\|\\'"` \t\r　\n]*/

module.exports = grammar({
  name: 'kumachan',
  extras: $ => [$.comment, Blank, LF],
  rules: (raw => {
    let rules = {}
    for (let [k,v] of Object.entries(raw)) {
      if (k == 'inline_type_args' || k == 'inline_ref') {
        rules[k] = $ => prec.left(v($))
      } else if (k == 'terms') {
        rules[k] = $ => prec.right(-1, v($))
      } else {
        rules[k] = $ => prec.right(v($))
      }
    }
    return rules
  })({
      source_file: $ => seq(optional($.shebang), $.stmts),
        shebang: $ => Pragma,
        stmts: $ => repeat1($.stmt),
          stmt: $ => choice($.import, $.do, $.decl_type, $.decl_const, $.decl_func, $.decl_macro),
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
            repr_func: $ => seq('(', $.lambda_header, $.input_type, $.output_type, ')'),
              lambda_header: $ => choice('lambda', '&'),
              input_type: $ => $.type,
              output_type: $ => $.type,
      decl_type: $ => seq('type', $.name, optional($.type_params), optional($.type_value), ';'),
        type_value: $ => choice($.native_type, $.implicit_type, $.union_type, $.boxed_type),
          native_type: $ => 'native',
          implicit_type: $ => seq('implicit', $.repr_bundle),
          union_type: $ => seq('union', '{', repeat1($.decl_type), '}'),
          boxed_type: $ => seq(optional($.box_option), $.inner_type),
            box_option: $ => choice('as', 'protected', 'opaque'),
            inner_type: $ => $.type,
        type_params: $ => seq('[', $.type_param, repeat(seq(',', $.type_param)), ']'),
          type_param: $ => seq($.name, optional($.type_bound)),
            type_bound: $ => seq(choice('<', '>'), $.type),
      decl_func: $ => seq($.scope, 'function', $.name, optional($.type_params), ':', $.signature, $.body, ';'),
        scope: $ => choice('public', 'private'),
        signature: $ => seq(optional($.implicit_input), $.repr_func),
          implicit_input: $ => seq('implicit', $.type_args),
        body: $ => choice($.native, $.lambda),
          native: $ => seq('native', $.string_text),
          lambda: $ => seq('(', $.lambda_header, $.pattern, $.expr, ')'),
            pattern: $ => choice($.pattern_trivial, $.pattern_tuple, $.pattern_bundle),
              pattern_trivial: $ => $.name,
              pattern_tuple: $ => choice(seq('(', ')'), seq('(', $.name, repeat(seq(',', $.name)), ')')),
              pattern_bundle: $ => choice(seq('{', '}'), seq('{', $.name, optional(seq(':', $.name)), repeat(seq(',', $.name, optional(seq(':', $.name)))), '}')),
      decl_const: $ => seq($.scope, 'const', $.name, ':', $.type, $.const_value, ';'),
        const_value: $ => choice($.native, $.expr),
      decl_macro: $ => seq($.scope, 'macro', $.name, $.macro_params, ':', $.expr, ';'),
        macro_params: $ => choice(seq('(', ')'), seq('(', $.name, repeat(seq(',', $.name)), ')')),
        expr: $ => seq($.terms, optional($.pipeline)),
          terms: $ => choice($.term, $.call),
            call: $ => seq($.callee, repeat1($.term)),
            callee: $ => $.term,
          pipeline: $ => seq($.pipe_op, $.pipe_func, optional($.pipe_arg), optional($.pipeline)),
            pipe_op: $ => choice('|', '.'),
            pipe_func: $ => $.term,
            pipe_arg: $ => repeat1($.term),
        term: $ => choice (
          $.cast, $.lambda, $.multi_switch, $.switch, $.if,
          $.block, $.cps, $.bundle, $.get, $.tuple, $.infix, $.inline_ref,
          $.array, $.int, $.float, $.formatter, $.string, $.char),
          cast: $ => seq('(', ':', $.type, ':', $.expr, ')'),
          multi_switch: $ => seq('switch*', '(', $.exprlist, ')', ':', $.multi_branch_list, 'end'),
            exprlist: $ => seq($.expr, repeat(seq(',', $.expr))),
            multi_branch_list: $ => repeat1(seq($.multi_branch, ',')),
              multi_branch: $ => seq($.multi_branch_key, ':', $.expr),
                multi_branch_key: $ => choice('default', seq('case', $.multi_type_ref, optional($.multi_pattern))),
                  multi_type_ref: $ => seq('[', $.type_ref_list, ']'),
                    type_ref_list: $ => seq($.type_ref, repeat(seq(',', $.type_ref))),
                    multi_pattern: $ => $.pattern_tuple,
          switch: $ => seq('switch', $.expr, ':', $.branch_list, 'end'),
            branch_list: $ => repeat1(seq($.branch, ',')),
              branch: $ => choice(seq('default', ':', $.expr), seq('case', $.type_ref, optional($.pattern), ':', $.expr)),
          if: $ => seq('if', $.expr, ':', $.expr, ',', repeat($.elif), 'else', ':', $.expr),
            elif: $ => seq('elif', $.expr, ':', $.expr, ','),
          block: $ => seq($.binding, $.block_value),
            binding: $ => seq('let', $.pattern, optional($.binding_type), ':=', $.expr),
              binding_type: $ => seq(':', optional('rec'), $.type),
              block_value: $ => seq(',', $.expr),
          cps: $ => seq('~', $.inline_ref, optional($.cps_binding), $.cps_input, ',', $.cps_output),
            cps_binding: $ => seq($.lambda_header, $.pattern, optional($.binding_type), ':='),
            cps_input: $ => $.expr,
            cps_output: $ => $.expr,
          bundle: $ => choice(seq('{', '}'), seq('{', optional($.update), $.pairlist, '}')),
            pairlist: $ => seq($.pair, repeat(seq(',', $.pair))),
              pair: $ => choice(seq($.name, ':', $.expr), $.name),
            update: $ => seq('...', $.expr, ','),
          get: $ => seq('$', '{', $.expr, '}', repeat1($.member)),
            member: $ => seq('.', $.name),
          tuple: $ => choice(seq('(', ')'), seq('(', $.exprlist, ')')),
          infix: $ => seq('$', '(', $.operand1, $.operator, $.operand2, ')'),
            operand1: $ => $.term,
            operator: $ => $.term,
            operand2: $ => $.term,
          inline_ref: $ => seq(optional($.module_prefix), $.name, optional($.inline_type_args)),
            inline_type_args: $ => seq(':', '[', $.type, repeat(seq(',', $.type)), ']'),
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
  })
});

