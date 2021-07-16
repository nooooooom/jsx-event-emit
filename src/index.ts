import { SetupContext, ComponentRenderProxy } from '@vue/composition-api'

type ExtractFunctionProps<T> = {
  [K in keyof T]: T[K] extends ((...args: any[]) => any) | undefined ? K : never
}[keyof T]

type ExtractFunctionStringProps<
  T,
  K = ExtractFunctionProps<T>
> = K extends string ? K : never

/**
 * @vue/babel-preset-jsx cannot correctly pass the event to the props of the child component when
 * provide the event starting with `on-`. The details of the problem are as follows
 * https://github.com/vuejs/jsx/issues/105
 *
 * The current processing method is to use `$listeners` to trigger events passed down from the parent component，
 * After the proposal(https://github.com/vuejs/jsx/pull/102) is merged, the method can be unified to be called props
 */
export function JSXEventEmitOnSetup<
  Event extends ExtractFunctionStringProps<Props>,
  Props
>(
  event: Event,
  props: Props,
  setupContext: SetupContext,
  ...args: Parameters<Props[Event]>
) {
  // Maybe the problem has been processed, then use the default method to call
  if (event in props && (typeof props[event] as unknown) === 'function') {
    props[event](...args)
    return
  }

  const onMatch = /^on/.exec(event)
  if (onMatch) {
    event = event.slice(onMatch[0].length) as Event
  }

  event = (event.charAt(0).toLocaleLowerCase() + event.slice(1)) as Event

  // Otherwise go to `$listeners` to trigger the call
  if (
    event in setupContext.listeners &&
    typeof setupContext.listeners[event] === 'function'
  ) {
    setupContext.listeners[event]!(...args)
    return
  }

  // If the event is not defined on the node label, the event will be sent manually
  setupContext.emit(event, ...args)
}

/**
 * Used to support event triggering in render
 */
export function JSXEventEmitOnProxy<
  Event extends ExtractFunctionStringProps<Proxy['$props']>,
  Proxy extends ComponentRenderProxy
>(event: Event, proxy: Proxy, ...args: Parameters<Proxy['$props'][Event]>) {
  const props = proxy.$props as Record<string, any>
  const setupContext = simpleResolveSetupContext(proxy)

  JSXEventEmitOnSetup(event, props, setupContext, ...(args as any[]))
}

/**
 * Simply parse the setupContext from the Vue instance, and only use the JSXEventEmitOnSetup method. The
 * details of the resolution method are shown in the following link address
 * https://github.com/vuejs/composition-api/blob/c4dfc1035f1ce8763429f82a21733bf0f668897c/src/mixin.ts#L192
 */
function simpleResolveSetupContext(proxy: ComponentRenderProxy): SetupContext {
  const ctx: Record<string, any> = { slots: {} }

  const propsPlain = [
    'root',
    'parent',
    'refs',
    'listeners',
    'isServer',
    'ssrContext'
  ]
  const propsReactiveProxy = ['attrs']
  const methodReturnVoid = ['emit']

  propsPlain.forEach((key) => {
    let srcKey = `$${key}`
    ctx[key] = proxy[srcKey]
  })

  propsReactiveProxy.forEach((key) => {
    let srcKey = `${key}`
    ctx[key] = proxy[srcKey]
  })

  methodReturnVoid.forEach((key) => {
    let srcKey = `$${key}`
    ctx[key] = proxy[srcKey].bind(proxy)
  })

  return ctx as SetupContext
}
