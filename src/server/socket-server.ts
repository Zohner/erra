import socketIO from 'socket.io';
import { SocketListener } from '../lib/interface';
import server from './server';


const onlineSocketSet = new Set<socketIO.Socket>()
const eventListeners: { [x: string]: SocketListener } = {}

server.use((req) => {
  // 返回false 表示当前请求被socket处理，其他插件忽略该请求
  if (server.isLocalServer(req) && req.url.includes('/socket.io')) return false
  return true
})

async function run() {
  const io = socketIO(await server.getHttpsServer());

  io.on('connection', socket => {
    onlineSocketSet.add(socket)

    Object.entries(eventListeners)
      .forEach(([evtName, listener]) => {
        socket.on(evtName, listener)
      })

    socket.on('disconnect', () => {
      onlineSocketSet.delete(socket)
    })
  })
}

function broadcast(eventName: string, ...args) {
  onlineSocketSet.forEach((s) => { s.emit(eventName, ...args) })
}

function once(eventName: string): Promise<any> {
  return Promise.race(
    Array.from(onlineSocketSet).map((s) => new Promise((resolve) => {
      function listener(data) {
        resolve(data)
        offEvtListener()
      }
      function offEvtListener() {
        Array.from(onlineSocketSet).forEach((s) => { s.removeListener(eventName, listener) })
      }

      s.once(eventName, listener)
    }))
  )
}

function on(evtName: string, cb: SocketListener) {
  if (eventListeners[evtName]) return

  eventListeners[evtName] = cb
  Array.from(onlineSocketSet)
    .forEach((socket) => {
      socket.on(evtName, cb)
    })
}

export default {
  broadcast,
  on,
  once,
  run,
}