import EventEmitter from 'events';
import path from 'path';
import fs from 'fs'
import yaml from 'js-yaml'

const ee = new EventEmitter()
let config: { [key: string]: any } = {}
let cofnigPath = ''

enum configKeys {
  SNIPPET = 'snippet',
  BREAKPOINT = 'breakpoint',
  API_BIND_SNIPPET = 'apiBindSnippet',
}

const exps = {
  init,
  key: configKeys,
  get(key: string) {
    return config[key]
  },
  on(evtName, handler) {
    return ee.on(evtName, handler)
  },
  emit(evtName: string, ...args) {
    return ee.emit(evtName, ...args)
  },
}

function init (cfgPath) {
  const p = path.resolve(process.cwd(), cfgPath)
  if (!fs.existsSync(p)) {
    console.error(`找不到配置的path: ${p}`);
    // todo: create config file
    throw new Error(`找不到配置的的path: ${p}`)
  }

  cofnigPath = p 
  fs.readFile(cofnigPath, "utf8", function (err, data) {
    if (err) {
      console.error(err);
      return 
    }
    config = yaml.load(data) || {}
    exps.emit('afterConfigInit')
  });
}

exps.on('update', async (key: string, value: any) => {
  config[key] = value
  
  if (!cofnigPath) return
  fs.writeFile(cofnigPath, yaml.dump(config), (err) => {
    if (err) {
      console.error(err);
      return
    }
    console.log(`更新配置成功：${key}`);
  }) 
})

export default exps