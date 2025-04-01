import {
  type Target,
  isReadonly,
  isShallow,
  reactive,
  reactiveMap,
  readonly,
  readonlyMap,
  shallowReactiveMap,
  shallowReadonlyMap,
  toRaw,
} from './reactive'
import { arrayInstrumentations } from './arrayInstrumentations'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import { ITERATE_KEY, track, trigger } from './dep'
import {
  hasChanged,
  hasOwn,
  isArray,
  isIntegerKey,
  isObject,
  isSymbol,
  makeMap,
} from '@vue/shared'
import { isRef } from './ref'
import { warn } from './warning'

const isNonTrackableKeys = /*@__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`)

const builtInSymbols = new Set(
  /*@__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => Symbol[key as keyof SymbolConstructor])
    .filter(isSymbol),
)

function hasOwnProperty(this: object, key: unknown) {
  // #10455 hasOwnProperty may be called with non-string values
  if (!isSymbol(key)) key = String(key)
  const obj = toRaw(this)
  track(obj, TrackOpTypes.HAS, key)
  return obj.hasOwnProperty(key as string)
}

// [drylint]: 基础的响应式代理操作，仅有 get 的代理操作，用于 MutableReactiveHandler, ReadonlyReactiveHandler 继承
class BaseReactiveHandler implements ProxyHandler<Target> {
  // [drylint]: 构造函数，在构造时立即执行
  constructor(
    // [drylint]: 构造器的第一个参数，可传入一个 boolean 值表示是否是创建只读的响应式代理，默认 false
    // [drylint]: protected readonly 是 TypeScript 中构造函数参数的语法，表示此处定义了一个受保护的只读的属性，同时这个参数传入时会自动赋值到该属性
    protected readonly _isReadonly = false,
    // [drylint]: 构造器的第二个参数，可传入一个 boolean 值表示是否是创建浅层的响应式代理，默认 false
    protected readonly _isShallow = false,
  ) {}

  // [drylint]: 代理对象的 get 操作
  get(target: Target, key: string | symbol, receiver: object): any {
    // [drylint]: 如果访问 '__v_skip' 属性，则直接返回 '__v_skip' 属性值
    if (key === ReactiveFlags.SKIP) return target[ReactiveFlags.SKIP]

    // [drylint]: 从当前构造的对象上读取 _isReadonly(是否只读) , _isShallow(是否浅层代理)
    const isReadonly = this._isReadonly,
      isShallow = this._isShallow
    // [drylint]: 如果访问 '__v_isReactive' 属性
    if (key === ReactiveFlags.IS_REACTIVE) {
      // [drylint]: 如果是只读的，返回 false ，不是只读的则返回 true
      return !isReadonly
      // [drylint]: 如果访问 '__v_isReadonly' 属性
    } else if (key === ReactiveFlags.IS_READONLY) {
      // [drylint]: 返回当前构造对象上的是否只读
      return isReadonly
      // [drylint]: 如果访问 '__v_isShallow' 属性
    } else if (key === ReactiveFlags.IS_SHALLOW) {
      // [drylint]: 返回当前构造对象上的是否浅层代理
      return isShallow
      // [drylint]: 如果访问 '__v_raw' 属性，也就是访问源对象
    } else if (key === ReactiveFlags.RAW) {
      if (
        // [drylint]: 如果 receiver 是源对象的代理对象，或者
        receiver ===
          (isReadonly
            ? isShallow
              ? shallowReadonlyMap
              : readonlyMap
            : isShallow
              ? shallowReactiveMap
              : reactiveMap
          ).get(target) ||
        // [drylint]: receiver 的 prototype 就是源对象的 prototype
        // receiver is not the reactive proxy, but has the same prototype
        // this means the receiver is a user proxy of the reactive proxy
        Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
      ) {
        // [drylint]: 返回源对象
        return target
      }
      // [drylint]: 源对象不存在，直接返回 undefined
      // early return undefined
      return
    }

    // [drylint]: 源对象是否是数组
    const targetIsArray = isArray(target)

    // [drylint]: 如果不是只读的
    if (!isReadonly) {
      let fn: Function | undefined
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn
      }
      if (key === 'hasOwnProperty') {
        return hasOwnProperty
      }
    }

    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      isRef(target) ? target : receiver,
    )

    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res
    }

    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }

    if (isShallow) {
      return res
    }

    if (isRef(res)) {
      // ref unwrapping - skip unwrap for Array + integer key.
      return targetIsArray && isIntegerKey(key) ? res : res.value
    }

    if (isObject(res)) {
      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning. Also need to lazy access readonly
      // and reactive here to avoid circular dependency.
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

// [drylint]: 可写的响应式代理操作构造器，继承了基础的响应式操作构造器(基础操作仅有代理 get 的操作)
// [drylint]: 实际代理了 get(继承自基础操作), set, deleteProperty, has, ownKeys 这些操作
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow = false) {
    super(false, isShallow)
  }

  set(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    let oldValue = target[key]
    if (!this._isShallow) {
      const isOldValueReadonly = isReadonly(oldValue)
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        if (isOldValueReadonly) {
          return false
        } else {
          oldValue.value = value
          return true
        }
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)
    const result = Reflect.set(
      target,
      key,
      value,
      isRef(target) ? target : receiver,
    )
    // don't trigger if target is something up in the prototype chain of original
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }

  deleteProperty(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
  ): boolean {
    const hadKey = hasOwn(target, key)
    const oldValue = target[key]
    const result = Reflect.deleteProperty(target, key)
    if (result && hadKey) {
      trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
    }
    return result
  }

  has(target: Record<string | symbol, unknown>, key: string | symbol): boolean {
    const result = Reflect.has(target, key)
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, TrackOpTypes.HAS, key)
    }
    return result
  }

  ownKeys(target: Record<string | symbol, unknown>): (string | symbol)[] {
    track(
      target,
      TrackOpTypes.ITERATE,
      isArray(target) ? 'length' : ITERATE_KEY,
    )
    return Reflect.ownKeys(target)
  }
}

class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow = false) {
    super(true, isShallow)
  }

  set(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }

  deleteProperty(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }
}

// [drylint]: 使用 reactive() 针对 Object, Array 对象创建响应式代理时，要代理的操作
export const mutableHandlers: ProxyHandler<object> =
  /*@__PURE__*/ new MutableReactiveHandler()

// [drylint]: 使用 readonly() 针对 Object, Array 对象创建只读代理时，要代理的操作
export const readonlyHandlers: ProxyHandler<object> =
  /*@__PURE__*/ new ReadonlyReactiveHandler()

// [drylint]: 使用 shallowReactive() 针对 Object, Array 对象创建浅层响应式代理时，要代理的操作
export const shallowReactiveHandlers: MutableReactiveHandler =
  // [drylint]: 传入第一个参数 true 表示仅生成浅层响应式代理的操作
  /*@__PURE__*/ new MutableReactiveHandler(true)

// [drylint]: 使用 shallowReadonly() 针对 Object, Array 对象创建浅层只读代理时，要代理的操作
// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers: ReadonlyReactiveHandler =
  // [drylint]: 传入第一个参数 true 表示仅生成浅层响应式代理的操作
  /*@__PURE__*/ new ReadonlyReactiveHandler(true)
