import {
  AbiCoder,
  getAddress,
  hexlify,
  keccak256,
  Signature as Sig,
  Signer,
  toUtf8Bytes,
  TypedDataEncoder,
  verifyTypedData
} from 'ethers';
import { network } from 'hardhat';
import { EAS, TestEIP1271Verifier } from '../../typechain-types';
import { ZERO_ADDRESS } from '../../utils/Constants';

export interface TypedData {
  name: string;
  type:
    | 'bool'
    | 'uint8'
    | 'uint16'
    | 'uint32'
    | 'uint64'
    | 'uint128'
    | 'uint256'
    | 'address'
    | 'string'
    | 'bytes'
    | 'bytes32';
}

export interface TypedDataConfig {
  address: string;
  version: string;
  chainId: number;
}

export interface DomainTypedData {
  chainId: number;
  name: string;
  verifyingContract: string;
  version: string;
}

export interface EIP712DomainTypedData {
  chainId: number;
  name: string;
  verifyingContract: string;
  version: string;
}

export interface EIP712MessageTypes {
  [additionalProperties: string]: TypedData[];
}

export type EIP712Params = {
  nonce?: bigint;
};

export interface EIP712TypedData<T extends EIP712MessageTypes, P extends EIP712Params> {
  domain: EIP712DomainTypedData;
  primaryType: keyof T;
  types: T;
  message: P;
}

export interface Signature {
  r: string;
  s: string;
  v: number;
}

export interface EIP712Request<T extends EIP712MessageTypes, P extends EIP712Params> extends Signature {
  params: P;
  types: EIP712TypedData<T, P>;
}

export type EIP712AttestationParams = EIP712Params & {
  attester: string;
  schema: string;
  recipient: string;
  expirationTime: bigint;
  revocable: boolean;
  refUID: string;
  data: Buffer;
  value: bigint;
  deadline: bigint;
};

export type EIP712RevocationParams = EIP712Params & {
  revoker: string;
  schema: string;
  uid: string;
  value: bigint;
  deadline: bigint;
};

export const EIP712_DOMAIN = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';

export const ATTEST_TYPED_SIGNATURE =
  // eslint-disable-next-line max-len
  'Attest(address attester,bytes32 schema,address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value,uint256 nonce,uint64 deadline)';
export const REVOKE_TYPED_SIGNATURE =
  'Revoke(address revoker,bytes32 schema,bytes32 uid,uint256 value,uint256 nonce,uint64 deadline)';
export const ATTEST_PRIMARY_TYPE = 'Attest';
export const REVOKE_PRIMARY_TYPE = 'Revoke';
export const ATTEST_TYPE: TypedData[] = [
  { name: 'attester', type: 'address' },
  { name: 'schema', type: 'bytes32' },
  { name: 'recipient', type: 'address' },
  { name: 'expirationTime', type: 'uint64' },
  { name: 'revocable', type: 'bool' },
  { name: 'refUID', type: 'bytes32' },
  { name: 'data', type: 'bytes' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint64' }
];
export const REVOKE_TYPE: TypedData[] = [
  { name: 'revoker', type: 'address' },
  { name: 'schema', type: 'bytes32' },
  { name: 'uid', type: 'bytes32' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint64' }
];

export class EIP712Utils {
  private verifier: EAS | TestEIP1271Verifier;
  private config?: TypedDataConfig;
  private name?: string;

  private constructor(verifier: EAS | TestEIP1271Verifier) {
    this.verifier = verifier;
  }

  public static async fromVerifier(verifier: EAS | TestEIP1271Verifier) {
    const utils = new EIP712Utils(verifier);
    await utils.init();

    return utils;
  }

  public async init() {
    this.config = {
      address: await this.verifier.getAddress(),
      version: await this.verifier.version(),
      chainId: network.config.chainId!
    };

    this.name = await this.verifier.getName();
  }

  public getDomainSeparator(name: string) {
    if (!this.config) {
      throw new Error("EIP712Utils wasn't initialized");
    }

    return keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
          keccak256(toUtf8Bytes(EIP712_DOMAIN)),
          keccak256(toUtf8Bytes(name)),
          keccak256(toUtf8Bytes(this.config.version)),
          this.config.chainId,
          this.config.address
        ]
      )
    );
  }

  public getDomainTypedData(): DomainTypedData {
    if (!this.config || !this.name) {
      throw new Error("EIP712Utils wasn't initialized");
    }

    return {
      name: this.name,
      version: this.config.version,
      chainId: this.config.chainId,
      verifyingContract: this.config.address
    };
  }

  public async signDelegatedAttestation(
    attester: Signer,
    schema: string,
    recipient: string | Signer,
    expirationTime: bigint,
    revocable: boolean,
    refUID: string,
    data: string,
    value: bigint,
    nonce: bigint,
    deadline: bigint
  ): Promise<EIP712Request<EIP712MessageTypes, EIP712AttestationParams>> {
    const params = {
      attester: await attester.getAddress(),
      schema,
      recipient: typeof recipient === 'string' ? recipient : await recipient.getAddress(),
      expirationTime,
      revocable,
      refUID,
      data: Buffer.from(data.slice(2), 'hex'),
      value,
      nonce,
      deadline
    };

    return EIP712Utils.signTypedDataRequest<EIP712MessageTypes, EIP712AttestationParams>(
      params,
      {
        domain: this.getDomainTypedData(),
        primaryType: ATTEST_PRIMARY_TYPE,
        message: params,
        types: {
          Attest: ATTEST_TYPE
        }
      },
      attester
    );
  }

  public async verifyDelegatedAttestationSignature(
    attester: string | Signer,
    request: EIP712Request<EIP712MessageTypes, EIP712AttestationParams>
  ): Promise<boolean> {
    return EIP712Utils.verifyTypedDataRequestSignature(
      typeof attester === 'string' ? attester : await attester.getAddress(),
      request
    );
  }

  public async hashDelegatedAttestation(
    attester: string | Signer,
    schema: string,
    recipient: string | Signer,
    expirationTime: bigint,
    revocable: boolean,
    refUID: string,
    data: string,
    value: bigint,
    nonce: bigint,
    deadline: bigint
  ): Promise<string> {
    const params = {
      attester: typeof attester === 'string' ? attester : await attester.getAddress(),
      schema,
      recipient: typeof recipient === 'string' ? recipient : await recipient.getAddress(),
      expirationTime,
      revocable,
      refUID,
      data: Buffer.from(data.slice(2), 'hex'),
      value,
      nonce,
      deadline
    };

    return EIP712Utils.hashTypedData<EIP712MessageTypes, EIP712AttestationParams>(params, {
      domain: this.getDomainTypedData(),
      primaryType: ATTEST_PRIMARY_TYPE,
      message: params,
      types: {
        Attest: ATTEST_TYPE
      }
    });
  }

  public async signDelegatedRevocation(
    revoker: Signer,
    schema: string,
    uid: string,
    value: bigint,
    nonce: bigint,
    deadline: bigint
  ): Promise<EIP712Request<EIP712MessageTypes, EIP712RevocationParams>> {
    const params = {
      revoker: await revoker.getAddress(),
      schema,
      uid,
      value,
      nonce,
      deadline
    };

    return EIP712Utils.signTypedDataRequest<EIP712MessageTypes, EIP712RevocationParams>(
      params,
      {
        domain: this.getDomainTypedData(),
        primaryType: REVOKE_PRIMARY_TYPE,
        message: params,
        types: {
          Revoke: REVOKE_TYPE
        }
      },
      revoker
    );
  }

  public async verifyDelegatedRevocationSignature(
    revoker: string | Signer,
    request: EIP712Request<EIP712MessageTypes, EIP712RevocationParams>
  ): Promise<boolean> {
    return EIP712Utils.verifyTypedDataRequestSignature(
      typeof revoker === 'string' ? revoker : await revoker.getAddress(),
      request
    );
  }

  public async hashDelegatedRevocation(
    revoker: string | Signer,
    schema: string,
    uid: string,
    value: bigint,
    nonce: bigint,
    deadline: bigint
  ): Promise<string> {
    const params = {
      revoker: typeof revoker === 'string' ? revoker : await revoker.getAddress(),
      schema,
      uid,
      value,
      nonce,
      deadline
    };

    return EIP712Utils.hashTypedData<EIP712MessageTypes, EIP712RevocationParams>(params, {
      domain: this.getDomainTypedData(),
      primaryType: REVOKE_PRIMARY_TYPE,
      message: params,
      types: {
        Revoke: REVOKE_TYPE
      }
    });
  }

  public static hashTypedData<T extends EIP712MessageTypes, P extends EIP712Params>(
    params: P,
    types: EIP712TypedData<T, P>
  ): string {
    return TypedDataEncoder.hash(types.domain, types.types, params);
  }

  public static async signTypedDataRequest<T extends EIP712MessageTypes, P extends EIP712Params>(
    params: P,
    types: EIP712TypedData<T, P>,
    signer: Signer
  ): Promise<EIP712Request<T, P>> {
    const rawSignature = await signer.signTypedData(types.domain, types.types, params);
    const signature = Sig.from(rawSignature);
    return { types, params, v: signature.v, r: signature.r, s: signature.s };
  }

  public static verifyTypedDataRequestSignature<T extends EIP712MessageTypes, P extends EIP712Params>(
    attester: string,
    request: EIP712Request<T, P>
  ): boolean {
    if (attester === ZERO_ADDRESS) {
      throw new Error('Invalid address');
    }

    const sig = Sig.from({ v: request.v, r: hexlify(request.r), s: hexlify(request.s) }).serialized;
    const recoveredAddress = verifyTypedData(request.types.domain, request.types.types, request.params, sig);

    return getAddress(attester) === getAddress(recoveredAddress);
  }
}
