// using literal strings instead of numbers so that it's easier to inspect
// debugger events

export enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate',
}

export enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
}

// [drylint]: 响应式对象标志的枚举值
export enum ReactiveFlags {
  // [drylint]: 标记一个对象是否应该跳过 Vue 的处理，为 true 时则不应该被处理，不会将该对象转换为响应式对象
  SKIP = '__v_skip',
  // [drylint]: 是否是响应式代理对象，每个响应式代理对象创建后，都会存入 __v_isReactive 属性并设为 true
  IS_REACTIVE = '__v_isReactive',
  // [drylint]: 是否是只读的，每个只读代理创建后，都会存入 __v_isReadonly 属性并设为 true
  IS_READONLY = '__v_isReadonly',
  // [drylint]: 是否是浅层代理，每个浅层创建后，都会存入 __v_isShallow 属性并设为 true
  IS_SHALLOW = '__v_isShallow',
  // [drylint]: 该属性存储对原始目标对象的引用，当需要用到源对象时，可以读取该属性值
  RAW = '__v_raw',
  // [drylint]: 是否是一个 ref ，每个 ref 对象创建后，都会存入 __v_isRef 属性并设为 true
  IS_REF = '__v_isRef',
}
