import { WebsocketChannelTypes, BaseAgentConfig, AgentCommand, TestRegistryCommand, GetTestRegistryResponse, WebsocketCopilotCommand, WebsocketCopilotResult, AgentCommandUpdate, TestRegistryCommandUpdate } from '@activepieces/copilot-shared'
import { Socket, io } from 'socket.io-client'
import { useWebSocketStore } from '../stores/use-websocket-store'
import { useAgentRegistryStore } from '../stores/use-agent-registry-store'
import { useTestRegistryStore } from '../stores/use-test-registry-store'

// Socket instance
let socket: Socket | null = null

// Event handlers
const handleAgentRegistryUpdate = (result: WebsocketCopilotResult): void => {
  if (result.type === AgentCommandUpdate.AGENT_REGISTRY_UPDATED) {
    const agentsMap = new Map(
      Object.entries(result.data).map(([name, config]) => [name, config as BaseAgentConfig])
    )
    useAgentRegistryStore.getState().setAgents(agentsMap)
  }
}

const handleTestRegistryUpdate = (result: WebsocketCopilotResult): void => {
  if (result.type === TestRegistryCommandUpdate.TEST_REGISTRY_UPDATED) {
    useTestRegistryStore.getState().setTestRegistry(result.data.data)
  }
}

const handleWebSocketResult = (result: WebsocketCopilotResult): void => {
  useWebSocketStore.getState().addResult(result)
  handleAgentRegistryUpdate(result)
  handleTestRegistryUpdate(result)
}

const setupEventListeners = (socketInstance: Socket): void => {
  socketInstance.on(WebsocketChannelTypes.UPDATE_RESULT, (data: WebsocketCopilotResult) => {
    useWebSocketStore.getState().setResults([data])
  })

  socketInstance.on(WebsocketChannelTypes.SET_RESULT, handleWebSocketResult)
}

// Socket management
const createSocket = (): Socket => {
  const newSocket = io('http://localhost:3002', {
    transports: ['websocket'],
  })
  setupEventListeners(newSocket)
  return newSocket
}

const connect = (): void => {
  if (!socket) {
    socket = createSocket()
  }

  if (!socket.connected) {
    socket.connect()
    socket.emit(WebsocketChannelTypes.GET_STATE)
    requestAgentRegistry()
  }
}

const disconnect = (): void => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

const getSocket = (): Socket | null => socket

// Command handlers
const sendCommand = async <T>(command: { type: WebsocketCopilotCommand; [key: string]: any }): Promise<T> => {
  if (!socket) {
    throw new Error('[WebSocket] Socket not connected')
  }

  return new Promise((resolve) => {
    socket!.emit(WebsocketChannelTypes.COMMAND, command, (response: T) => {
      resolve(response)
    })
  })
}

const requestAgentRegistry = (): void => {
  if (!socket) {
    return
  }

  socket.emit(WebsocketChannelTypes.COMMAND, {
    command: AgentCommand.GET_AGENT_REGISTRY,
    data: {}
  })
}

const getTestRegistry = async (agentName: string) => {
  console.debug('[WebSocket] Requesting test registry for agent:', agentName)
  const response = await sendCommand<GetTestRegistryResponse>({
    type: TestRegistryCommand.GET_TEST_REGISTRY,
    command: TestRegistryCommand.GET_TEST_REGISTRY,
    data: {
      agentName
    }
  })

  console.debug('[WebSocket] Received test registry response:', response)
  useTestRegistryStore.getState().setTestRegistry(response.data)
  return response.data
}

// Public API
export const websocketService = {
  connect,
  disconnect,
  requestAgentRegistry,
  getSocket,
  getTestRegistry,
  sendCommand,
} 