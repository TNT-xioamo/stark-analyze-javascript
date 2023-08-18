/**
 * @license Apache-2.0
 * @copyright 2023-08-18 @stark
 * @packageDocumentation
 */

if (!Math.trunc) {
  Math.trunc = function (v) {
    return v < 0 ? Math.ceil(v) : Math.floor(v)
  }
}

if (!Number.isInteger) {
  Number.isInteger = function (value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value
  }
}

const DIGITS = '0123456789abcdef'

export class UUID {
  constructor(readonly bytes: Readonly<Uint8Array>) {
    if (bytes.length !== 16) {
      throw new TypeError('not 128-bit length')
    }
  }

  /**
   * @param unixTsMs - A
   * @param randA - A
   * @param randBHi -
   * @param randBLo -
   */
  static fromFieldsV7(unixTsMs: number, randA: number, randBHi: number, randBLo: number): UUID {
    if (
      !Number.isInteger(unixTsMs) ||
      !Number.isInteger(randA) ||
      !Number.isInteger(randBHi) ||
      !Number.isInteger(randBLo) ||
      unixTsMs < 0 ||
      randA < 0 ||
      randBHi < 0 ||
      randBLo < 0 ||
      unixTsMs > 0xffff_ffff_ffff ||
      randA > 0xfff ||
      randBHi > 0x3fff_ffff ||
      randBLo > 0xffff_ffff
    ) {
      throw new RangeError('invalid field value')
    }

    const bytes = new Uint8Array(16)
    bytes[0] = unixTsMs / 2 ** 40
    bytes[1] = unixTsMs / 2 ** 32
    bytes[2] = unixTsMs / 2 ** 24
    bytes[3] = unixTsMs / 2 ** 16
    bytes[4] = unixTsMs / 2 ** 8
    bytes[5] = unixTsMs
    bytes[6] = 0x70 | (randA >>> 8)
    bytes[7] = randA
    bytes[8] = 0x80 | (randBHi >>> 24)
    bytes[9] = randBHi >>> 16
    bytes[10] = randBHi >>> 8
    bytes[11] = randBHi
    bytes[12] = randBLo >>> 24
    bytes[13] = randBLo >>> 16
    bytes[14] = randBLo >>> 8
    bytes[15] = randBLo
    return new UUID(bytes)
  }

  toString(): string {
    let text = ''
    for (let i = 0; i < this.bytes.length; i++) {
      text = text + DIGITS.charAt(this.bytes[i] >>> 4) + DIGITS.charAt(this.bytes[i] & 0xf)
      if (i === 3 || i === 5 || i === 7 || i === 9) {
        text += '-'
      }
    }

    if (text.length !== 36) {
      throw new Error('Invalid UUIDv7 was generated')
    }
    return text
  }

  clone(): UUID {
    return new UUID(this.bytes.slice(0))
  }

  equals(other: UUID): boolean {
    return this.compareTo(other) === 0
  }

  compareTo(other: UUID): number {
    for (let i = 0; i < 16; i++) {
      const diff = this.bytes[i] - other.bytes[i]
      if (diff !== 0) {
        return Math.sign(diff)
      }
    }
    return 0
  }
}

class V7Generator {
  private timestamp = 0
  private counter = 0
  private readonly random = new DefaultRandom()

  generate(): UUID {
    const value = this.generateOrAbort()
    if (value !== undefined) {
      return value
    } else {
      this.timestamp = 0
      const valueAfterReset = this.generateOrAbort()
      if (valueAfterReset === undefined) {
        throw new Error('Could not generate UUID after timestamp reset')
      }
      return valueAfterReset
    }
  }

  generateOrAbort(): UUID | undefined {
    const MAX_COUNTER = 0x3ff_ffff_ffff
    const ROLLBACK_ALLOWANCE = 10_000

    const ts = Date.now()
    if (ts > this.timestamp) {
      this.timestamp = ts
      this.resetCounter()
    } else if (ts + ROLLBACK_ALLOWANCE > this.timestamp) {
      this.counter++
      if (this.counter > MAX_COUNTER) {
        this.timestamp++
        this.resetCounter()
      }
    } else {
      return undefined
    }

    return UUID.fromFieldsV7(
      this.timestamp,
      Math.trunc(this.counter / 2 ** 30),
      this.counter & (2 ** 30 - 1),
      this.random.nextUint32()
    )
  }

  private resetCounter(): void {
    this.counter = this.random.nextUint32() * 0x400 + (this.random.nextUint32() & 0x3ff)
  }
}

declare const UUIDV7_DENY_WEAK_RNG: boolean

let getRandomValues: <T extends Uint8Array | Uint32Array>(buffer: T) => T = (buffer) => {
  if (typeof UUIDV7_DENY_WEAK_RNG !== 'undefined' && UUIDV7_DENY_WEAK_RNG) {
    throw new Error('no cryptographically strong RNG available')
  }

  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = Math.trunc(Math.random() * 0x1_0000) * 0x1_0000 + Math.trunc(Math.random() * 0x1_0000)
  }
  return buffer
}

if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
  getRandomValues = (buffer) => crypto.getRandomValues(buffer)
}

class DefaultRandom {
  private readonly buffer = new Uint32Array(8)
  private cursor = Infinity
  nextUint32(): number {
    if (this.cursor >= this.buffer.length) {
      getRandomValues(this.buffer)
      this.cursor = 0
    }
    return this.buffer[this.cursor++]
  }
}

let defaultGenerator: V7Generator | undefined

export const uuidv7 = (): string => uuidv7obj().toString()

const uuidv7obj = (): UUID => (defaultGenerator || (defaultGenerator = new V7Generator())).generate()
