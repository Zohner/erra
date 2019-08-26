import { pick, constant, fromPairs, identity, isArray, isFunction, isPlainObject, map, mergeWith, pipe, toPairs, values } from 'lodash/fp';
import { mock } from 'mockjs';
import yaml from 'js-yaml'
import genUUID from 'uuid';

import configManager from './config-manager';
import ss from '../socket-server'
import { SOCKET_MSG_TAG_API, Snippet } from '../../lib/interface';

const snippetsFn = new Map<string, Function>()
const snippetsMeta = new Map<string, Snippet>()

configManager.on('afterConfigInit', () => {
  Object.entries(configManager.get('snippets') || {})
    .forEach(([key, val]) => {
      snippetsFn.set(key, parse(val))
    })
})

function getSnippetList() {
  return map(pick(['id', 'name', 'correlationApi']), [...snippetsMeta.values()])
}

ss.on(SOCKET_MSG_TAG_API.SP_GET, (cb) => {
  cb(getSnippetList())
})

ss.on(SOCKET_MSG_TAG_API.SP_SAVE, ({ id, code }, cb) => {
  const { name, content } = yaml.load(code)
  const spId = id || genUUID()
  snippetsMeta.set(spId, {
    id: spId,
    name,
    content,
  })
  snippetsFn.set(spId, parse(content))
  ss.broadcast(SOCKET_MSG_TAG_API.SP_UPDATE, getSnippetList())
})

export enum PARSE_STRATEGY {
  FIXED = 'fixed',
  MOCKJS = 'mockjs',
  SNIPPET = 'snippet',
}

// 将策略解析成函数
function parseStrategy({ strategy = 'fixed', value, key = null }): Function {
  switch (strategy) {
    case PARSE_STRATEGY.FIXED:
      return constant(value)
    case PARSE_STRATEGY.MOCKJS:
      if (key) {
        return constant(
          // transDesc是一个`返回value的函数`，所以此处只取mock的值
          // key 与 该函数 在上层关联
          values(mock({ [key]: value }))[0]
        )
      }
      return constant(mock(value))
    case PARSE_STRATEGY.SNIPPET:
      // snippet 是否被解析过，如果没有则解析后更新snippets
      const parsed = snippetsFn.get(value)
      if (parsed) return parsed

      const source = configManager.get('snippets')[value]
      if (!source) throw new Error(`[snippet解析错误]找不到依赖的snippet：${value}`)

      const ps = parseSnippet(source)
      snippetsFn.set(value, ps)
      return ps
  }
  return identity
}

function parseSnippet(snippet) {
  if (isPlainObject(snippet)) {
    const fixedRegx = new RegExp(`^\\$${PARSE_STRATEGY.FIXED}\\s+`)
    const mockjsRegx = new RegExp(`^\\$${PARSE_STRATEGY.MOCKJS}\\s+`)
    const snippetRegx = new RegExp(`^\\$${PARSE_STRATEGY.SNIPPET}\\s+`)

    return pipe(
      toPairs,
      map(([key, value]) => {
        if (fixedRegx.test(key)) {
          return [key.replace(fixedRegx, ''), parseStrategy({
            strategy: PARSE_STRATEGY.FIXED,
            value,
          })]
        } else if (mockjsRegx.test(key)) {
          return [
            // 去除掉mockjs key中包含的修饰符
            key.replace(mockjsRegx, '').replace(/\|.+$/, ''),
            parseStrategy({
              strategy: PARSE_STRATEGY.MOCKJS,
              key: key.replace(mockjsRegx, ''),
              value,
            })]
        } else if (snippetRegx.test(key)) {
          return [key.replace(snippetRegx, ''), parseStrategy({
            strategy: PARSE_STRATEGY.SNIPPET,
            value,
          })]
        }

        return [key, parseSnippet(value)]
      }),
      fromPairs,
    )(snippet)
  } else if (isArray(snippet)) {
    return map(parseSnippet)(snippet)
  }
  return parseStrategy({ value: snippet })
}

export function parse(snippet): (data: any) => any {
  const snippeter = parseSnippet(snippet)

  return (data): any => {
    if (isFunction(snippeter)) return snippeter(data)
    const rs = mergeWith((objValue, srcValue) => {
      if (isFunction(srcValue)) {
        return srcValue(objValue)
      }
      return undefined
    }, data, snippeter)
    return rs
  }
}

export function getSnippet(id: string): Function {
  return snippetsFn.get(id)
}

export function addSnippet(id: string, snippet: any): void {
  snippetsFn.set(id, parse(snippet))
}
