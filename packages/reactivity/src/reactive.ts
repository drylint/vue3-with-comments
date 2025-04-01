import { def, hasOwn, isObject, toRawType } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers,
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers,
  shallowReadonlyCollectionHandlers,
} from './collectionHandlers'
import type { RawSymbol, Ref, UnwrapRefSimple } from './ref'
import { ReactiveFlags } from './constants'
import { warn } from './warning'

// [drylint]: 定义一个对象可能有的标志属性
export interface Target {
  // [drylint]: 对象可能有的 '__v_skip' 标志，如果该属性值为 true ，则表示跳过处理，不会将该对象转换为响应式对象
  [ReactiveFlags.SKIP]?: boolean
  // [drylint]: 对象可能有的 '__v_isReactive' 标志，如果该属性值为 true ，则表示该对象为响应式代理对象
  [ReactiveFlags.IS_REACTIVE]?: boolean
  // [drylint]: 对象可能有的 '__v_isReadonly' 标志，如果该属性值为 true ，则表示该对象为只读的对象
  [ReactiveFlags.IS_READONLY]?: boolean
  // [drylint]: 对象可能有的 '__v_isShallow' 标志，如果该属性值为 true ，则表示该对象为浅层代理对象
  [ReactiveFlags.IS_SHALLOW]?: boolean
  // [drylint]: 对象可能有的 '__v_raw' 标志，用于保存源对象的引用
  [ReactiveFlags.RAW]?: any
}

// [drylint]: 响应式代理对象的 WeakMap 映射，将每一个源对象和代理对象作为 WeakMap 的键值对保存，以供后续使用
export const reactiveMap: WeakMap<Target, any> = new WeakMap<Target, any>()
// [drylint]: 浅层响应式代理对象映射，将每一个源对象和代理对象作为 WeakMap 的键值对保存，以供后续使用
export const shallowReactiveMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()
// [drylint]: 只读代理对象映射，将每一个源对象和代理对象作为 WeakMap 的键值对保存，以供后续使用
export const readonlyMap: WeakMap<Target, any> = new WeakMap<Target, any>()
// [drylint]: 浅层只读对象映射，将每一个源对象和代理对象作为 WeakMap 的键值对保存，以供后续使用
export const shallowReadonlyMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()

// [drylint]: 目标值的类型枚举
enum TargetType {
  // [drylint]: INVALID 表示目标值是无效的值
  INVALID = 0,
  // [drylint]: COMMON 表示目标值是普通对象，包括 Object, Array 类型
  COMMON = 1,
  // [drylint]: COLLECTION 表示目标值是集合类型的对象，包括 Map, Set, WeakMap, WeakSet 类型
  COLLECTION = 2,
}

// [drylint]: 传入一个原始类型(如：Array, Object, String)，返回一个 TargetType 枚举值
function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      // [drylint]: 传入原始类型为 Object, Array 时，返回 TargetType 普通对象枚举值
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      // [drylint]: 传入原始类型为 Map, Set, WeakMap, WeakSet 时，返回 TargetType 集合类型的对象枚举值
      return TargetType.COLLECTION
    default:
      // [drylint]: 其他的类型，都视为无效类型，返回 TargetType 无效值的枚举值
      return TargetType.INVALID
  }
}

// [drylint]: 获取一个目标值的类型 (TargetType) ，返回一个 TargetType 枚举值
function getTargetType(value: Target) {
  // [drylint]: 如果目标值的 '__v_skip' 标志是 true ，或者目标值不是一个可扩展的对象
  return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
    ? // [drylint]: 返回 TargetType 中表示无效的枚举值
      TargetType.INVALID
    : // [drylint]: 根据目标值的原始类型，返回一个 TargetType 枚举值
      targetTypeMap(toRawType(value))
}

// [drylint]: 一个 TypeScript 类型工具，解包嵌套的 ref ，返回只有一层的 ref
// only unwrap nested ref
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRefSimple<T>

declare const ReactiveMarkerSymbol: unique symbol

export interface ReactiveMarker {
  [ReactiveMarkerSymbol]?: void
}
// [drylint]: reactive() 返回值的类型，Reactive 类型
export type Reactive<T> = UnwrapNestedRefs<T> &
  (T extends readonly any[] ? ReactiveMarker : {})

/**
 * [drylint]: reactive() 用于获取一个对象的响应式代理对象，传入一个源对象，返回该对象的响应式代理对象
 * Returns a reactive proxy of the object.
 *
 * The reactive conversion is "deep": it affects all nested properties. A
 * reactive object also deeply unwraps any properties that are refs while
 * maintaining reactivity.
 *
 * @example
 * ```js
 * const obj = reactive({ count: 0 })
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-core.html#reactive}
 */
export function reactive<T extends object>(target: T): Reactive<T>
export function reactive(target: object) {
  // [drylint]: 如果传入的对象是只读代理对象，则直接返回该对象
  // if trying to observe a readonly proxy, return the readonly version.
  if (isReadonly(target)) {
    return target
  }
  // [drylint]: 为传入的对象创建一个响应式代理对象并返回
  return createReactiveObject(
    // [drylint]: 传入要代理的对象
    target,
    // [drylint]: false 表示不是创建只读的响应式代理对象
    false,
    // [drylint]: 当目标对象为普通对象时，要代理的操作，mutableHandlers 中包含 get, set, has, deleteProperty, ownKeys 操作
    mutableHandlers,
    // [drylint]: 当目标对象为集合类对象时，要代理的操作，mutableCollectionHandlers 中包含读取和写入的操作
    mutableCollectionHandlers,
    // [drylint]: 目标对象和响应式代理对象的映射，每创建一个响应式代理对象，都会将目标对象和代理对象作为键值对存入映射中，以便后续使用
    reactiveMap,
  )
}

export declare const ShallowReactiveMarker: unique symbol

export type ShallowReactive<T> = T & { [ShallowReactiveMarker]?: true }

/**
 * [drylint]: shallowReactive() 用于创建一个对象的浅层响应式代理对象
 * Shallow version of {@link reactive}.
 *
 * Unlike {@link reactive}, there is no deep conversion: only root-level
 * properties are reactive for a shallow reactive object. Property values are
 * stored and exposed as-is - this also means properties with ref values will
 * not be automatically unwrapped.
 *
 * @example
 * ```js
 * const state = shallowReactive({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties is reactive
 * state.foo++
 *
 * // ...but does not convert nested objects
 * isReactive(state.nested) // false
 *
 * // NOT reactive
 * state.nested.bar++
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreactive}
 */
export function shallowReactive<T extends object>(
  // [drylint]: 传入一个要代理的源对象
  target: T,
  // [drylint]: 返回浅层响应式代理对象的类型
): ShallowReactive<T> {
  // [drylint]: 为传入的对象创建一个浅层响应式代理对象并返回
  return createReactiveObject(
    // [drylint]: 传入要代理的对象
    target,
    // [drylint]: 传入 false 表示不是创建只读的响应式代理对象
    false,
    // [drylint]: 传入针对普通对象的浅层响应式代理对象的代理操作
    shallowReactiveHandlers,
    // [drylint]: 传入针对集合类对象的浅层响应式代理对象的代理操作
    shallowCollectionHandlers,
    // [drylint]: 传入浅层响应式代理对象映射，每创建一个浅层响应式代理对象，都会将目标对象和浅层代理对象作为键值对存入映射中，以便后续使用
    shallowReactiveMap,
  )
}

// [drylint]: JavaScript 中的基本类型组成的 TypeScript 联合类型
type Primitive = string | number | boolean | bigint | symbol | undefined | null
// [drylint]: JavaScript 内置类型，其中包括基本类型
export type Builtin = Primitive | Function | Date | Error | RegExp
// 对一个值进行深层响应式代理时，返回的数据类型
export type DeepReadonly<T> = T extends Builtin
  ? // [drylint]: 如果值为 JavaScript 内置类型时，直接返回该值
    T
  : // [drylint]: 如果源对象类型是一个 Map
    T extends Map<infer K, infer V>
    ? // 否则，则返回 ReadonlyMap
      ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : T extends WeakSet<infer U>
              ? WeakSet<DeepReadonly<U>>
              : T extends Promise<infer U>
                ? Promise<DeepReadonly<U>>
                : T extends Ref<infer U, unknown>
                  ? Readonly<Ref<DeepReadonly<U>>>
                  : T extends {}
                    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                    : Readonly<T>

/**
 * [drylint]: readonly() 获取一个深层只读代理对象，可传入一个普通对象，或响应式代理对象，或一个 ref ，返回只读代理对象
 * [drylint]: 只读代理对象是深层只读的，表示深层嵌套的属性都将不能被修改，属性值为 ref 时会向 reactive 一样自动解包 ref
 * Takes an object (reactive or plain) or a ref and returns a readonly proxy to
 * the original.
 *
 * A readonly proxy is deep: any nested property accessed will be readonly as
 * well. It also has the same ref-unwrapping behavior as {@link reactive},
 * except the unwrapped values will also be made readonly.
 *
 * @example
 * ```js
 * const original = reactive({ count: 0 })
 *
 * const copy = readonly(original)
 *
 * watchEffect(() => {
 *   // works for reactivity tracking
 *   console.log(copy.count)
 * })
 *
 * // mutating original will trigger watchers relying on the copy
 * original.count++
 *
 * // mutating the copy will fail and result in a warning
 * copy.count++ // warning!
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-core.html#readonly}
 */
export function readonly<T extends object>(
  // [drylint]: 接收一个对象类型的参数
  target: T,
  // [drylint]: 返回类型为深层只读代理对象
): DeepReadonly<UnwrapNestedRefs<T>> {
  // [drylint]: 创建一个响应式代理对象
  return createReactiveObject(
    // [drylint]: 传入源对象
    target,
    // [drylint]: 传入 true 表示要创建一个只读代理
    true,
    // [drylint]: 传入对普通对象进行只读代理的操作
    readonlyHandlers,
    // [drylint]: 传入对集合类对象进行只读代理的操作
    readonlyCollectionHandlers,
    // [drylint]: 传入源对象和只读代理对象的映射，每个源对象和只读代理对象都会当做键值对存入这个映射中
    readonlyMap,
  )
}

/**
 * [drylint]: 创建一个浅层的只读代理对象，没有进行深层代理，仅根级别的代理，也就是返回的只读代理对象只有第一层不能被修改
 * Shallow version of {@link readonly}.
 *
 * Unlike {@link readonly}, there is no deep conversion: only root-level
 * properties are made readonly. Property values are stored and exposed as-is -
 * this also means properties with ref values will not be automatically
 * unwrapped.
 *
 * @example
 * ```js
 * const state = shallowReadonly({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties will fail
 * state.foo++
 *
 * // ...but works on nested objects
 * isReadonly(state.nested) // false
 *
 * // works
 * state.nested.bar++
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreadonly}
 */
export function shallowReadonly<T extends object>(target: T): Readonly<T> {
  // [drylint]: 创建一个响应式代理对象
  return createReactiveObject(
    // [drylint]: 传入源对象
    target,
    // [drylint]: 传入 true 表示要创建一个只读代理
    true,
    // [drylint]: 传入对普通对象进行浅层只读代理的操作
    shallowReadonlyHandlers,
    // [drylint]: 传入对集合类对象进行浅层只读代理的操作
    shallowReadonlyCollectionHandlers,
    // [drylint]: 传入源对象和浅层只读代理对象的映射，每个源对象和浅层只读代理对象都会当做键值对存入这个映射中
    shallowReadonlyMap,
  )
}

// [drylint]: 为一个源对象创建一个响应式代理对象
function createReactiveObject(
  // [drylint]: 源对象
  target: Target,
  // [drylint]: 是否创建只读的响应式代理对象
  isReadonly: boolean,
  // [drylint]: 代理 Object 和 Array 对象时，要代理的操作，比如 get, set, has, deleteProperty, ownKeys 等操作
  baseHandlers: ProxyHandler<any>,
  // [drylint]: 代理 Map, Set, WeakMap, WeakSet 等集合类对象时，要代理的操作
  collectionHandlers: ProxyHandler<any>,
  // [drylint]: 源对象和响应式代理对象的映射
  proxyMap: WeakMap<Target, any>,
) {
  // [drylint]: 如果传入的值不是对象类型
  if (!isObject(target)) {
    // [drylint]: 如果是在开发环境中
    if (__DEV__) {
      // [drylint]: 展示警告信息：传入的值无法创建只读的/普通的响应式代理对象
      warn(
        `value cannot be made ${isReadonly ? 'readonly' : 'reactive'}: ${String(
          target,
        )}`,
      )
    }
    // [drylint]: 直接返回传入的值
    return target
  }
  // [drylint]: 如果传入的对象已经是一个代理，且不是要创建一个只读的代理，则直接返回传入的对象
  // target is already a Proxy, return it.
  // exception: calling readonly() on a reactive object
  if (
    // [drylint]: 如果传入的对象的 '__v_raw' 属性值存在 ，并且
    target[ReactiveFlags.RAW] &&
    // [drylint]: 不是要创建一个只读的代理并且传入的对象的 '__v_isReactive' 属性不为 true
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    // [drylint]: 直接返回传入的对象
    return target
  }
  // [drylint]: 获取传入对象的类型，除 Object, Array, Map, Set, WeakMap, WeakSet 外都视为无效值
  // only specific value types can be observed.
  const targetType = getTargetType(target)
  // [drylint]: 如果传入对象的类型是无效类型
  if (targetType === TargetType.INVALID) {
    // [drylint]: 直接返回传入对象
    return target
  }
  // [drylint]: 从代理对象的映射中获取传入对象的代理对象
  // target already has corresponding Proxy
  const existingProxy = proxyMap.get(target)
  // [drylint]: 如果传入对象存在代理对象
  if (existingProxy) {
    // [drylint]: 直接返回已存在的代理对象
    return existingProxy
  }
  // [drylint]: 开始为传入对象创建一个代理对象
  const proxy = new Proxy(
    // [drylint]: Proxy 第一个参数，传入对象
    target,
    // [drylint]: Proxy 第二个参数，要代理的操作，比如 get, set, has, deleteProperty 等操作，根据目标对象类型决定传入集合类对象的操作还是普通对象的操作
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )
  // [drylint]: 将目标对象和代理对象作为键值对，存入代理映射中，后续如果对同一个目标对象进行代理，则可以直接读取使用，而不需要重新创建代理
  proxyMap.set(target, proxy)
  // [drylint]: 返回创建好的响应式代理对象
  return proxy
}

/**
 * [drylint]: 判断一个值是否是响应式代理对象(由 reactive, shallowReactive, ref 对一个对象创建的代理对象)
 * [drylint]: 需要注意的是，使用 ref(<基础类型>)，或使用 shallowRef(<对象类型>) 创建的 ref 不是响应式代理对象，仅当 ref<对象类型> 时，内部会调用 reactive 进行处理
 * Checks if an object is a proxy created by {@link reactive} or
 * {@link shallowReactive} (or {@link ref} in some cases).
 *
 * @example
 * ```js
 * isReactive(reactive({}))            // => true
 * isReactive(readonly(reactive({})))  // => true
 * isReactive(ref({}).value)           // => true
 * isReactive(readonly(ref({})).value) // => true
 * isReactive(ref(true))               // => false
 * isReactive(shallowRef({}).value)    // => false
 * isReactive(shallowReactive({}))     // => true
 * ```
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreactive}
 */
export function isReactive(value: unknown): boolean {
  // [drylint]: 如果传入的值是只读的('__v_isReadonly' 属性为 true)
  if (isReadonly(value)) {
    // [drylint]: 从传入的值的中，获取 __v_raw 属性值(源对象)，判断这个对象是否是响应式代理对象
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }
  // [drylint]: 如果传入的值存在，并且这个值的 __v_isReactive 属性值为 true ，则返回 true
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

/**
 * [drylint]: 判断一个值是否是只读代理对象(由 readonly, shallowReadonly 创建的代理对象)
 * Checks whether the passed value is a readonly object. The properties of a
 * readonly object can change, but they can't be assigned directly via the
 * passed object.
 *
 * The proxies created by {@link readonly} and {@link shallowReadonly} are
 * both considered readonly, as is a computed ref without a set function.
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreadonly}
 */
export function isReadonly(value: unknown): boolean {
  // [drylint]: 传入值为真值 (truthy) ，并且值的 '__v_isReadonly' 属性值为 true ，则返回 true 表示该值为只读
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

// [drylint]: 判断一个值是否是浅层代理对象
export function isShallow(value: unknown): boolean {
  // [drylint]: 传入值为真值 (truthy) ，并且值的 '__v_isShallow' 属性值为 true ，则返回 true 表示该值为只读
  return !!(value && (value as Target)[ReactiveFlags.IS_SHALLOW])
}

/**
 * [drylint]: 判断一个值是否是代理对象(由 reactive, readonly, shallowReactive, shallowReadonly 创建的代理对象)
 * Checks if an object is a proxy created by {@link reactive},
 * {@link readonly}, {@link shallowReactive} or {@link shallowReadonly}.
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isproxy}
 */
export function isProxy(value: any): boolean {
  // [drylint]: 传入值为真值 (truthy) 时，且这个值的 '__v_raw' 属性值存在时，返回 true ，否则返回 false
  return value ? !!value[ReactiveFlags.RAW] : false
}

/**
 * [drylint]: 返回一个代理对象的源对象，需要注意的是，用户应尽量避免读取或操作源对象，应尽量通过代理对象进行操作。
 * Returns the raw, original object of a Vue-created proxy.
 *
 * `toRaw()` can return the original object from proxies created by
 * {@link reactive}, {@link readonly}, {@link shallowReactive} or
 * {@link shallowReadonly}.
 *
 * This is an escape hatch that can be used to temporarily read without
 * incurring proxy access / tracking overhead or write without triggering
 * changes. It is **not** recommended to hold a persistent reference to the
 * original object. Use with caution.
 *
 * @example
 * ```js
 * const foo = {}
 * const reactiveFoo = reactive(foo)
 *
 * console.log(toRaw(reactiveFoo) === foo) // true
 * ```
 *
 * @param observed - The object for which the "raw" value is requested.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#toraw}
 */
export function toRaw<T>(observed: T): T {
  // [drylint]: 传入的值为真值时，返回传入值的 '__v_raw' 属性值
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  // [drylint]: 如果获取的 '__v_raw' 属性值存在，则递归调用 toRaw 获取源对象，否则传入值就已经是源对象，直接返回即可
  return raw ? toRaw(raw) : observed
}

// [drylint]: TypeScript 工具类型，将一个对象类型扩展 RawSymbol 属性为 true
export type Raw<T> = T & { [RawSymbol]?: true }

/**
 * [drylint]: 将一个对象标记为不需要转换为响应式代理对象(实际是将 '__v_skip' 属性值设置为 true) ，返回这个对象
 * Marks an object so that it will never be converted to a proxy. Returns the
 * object itself.
 *
 * @example
 * ```js
 * const foo = markRaw({})
 * console.log(isReactive(reactive(foo))) // false
 *
 * // also works when nested inside other reactive objects
 * const bar = reactive({ foo })
 * console.log(isReactive(bar.foo)) // false
 * ```
 *
 * **Warning:** `markRaw()` together with the shallow APIs such as
 * {@link shallowReactive} allow you to selectively opt-out of the default
 * deep reactive/readonly conversion and embed raw, non-proxied objects in your
 * state graph.
 *
 * @param value - The object to be marked as "raw".
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#markraw}
 */
export function markRaw<T extends object>(value: T): Raw<T> {
  if (!hasOwn(value, ReactiveFlags.SKIP) && Object.isExtensible(value)) {
    def(value, ReactiveFlags.SKIP, true)
  }
  return value
}

/**
 * [drylint]: 如果可以，返回一个传入值的响应式代理对象，否则返回传入的值
 * Returns a reactive proxy of the given value (if possible).
 *
 * If the given value is not an object, the original value itself is returned.
 *
 * @param value - The value for which a reactive proxy shall be created.
 */
export const toReactive = <T extends unknown>(value: T): T =>
  // [drylint]: 如果传入的值是一个对象，则返回 reactive 对该值创建的响应式代理对象，否则直接返回传入的值
  isObject(value) ? reactive(value) : value

/**
 * [drylint]: 如果可以，返回一个传入值的只读的代理对象，否则返回传入的值
 * Returns a readonly proxy of the given value (if possible).
 *
 * If the given value is not an object, the original value itself is returned.
 *
 * @param value - The value for which a readonly proxy shall be created.
 */
export const toReadonly = <T extends unknown>(value: T): DeepReadonly<T> =>
  // [drylint]: 如果传入的值是一个对象，则返回 readonly 对该值创建的只读的代理对象，否则直接返回传入的值
  isObject(value) ? readonly(value) : (value as DeepReadonly<T>)
