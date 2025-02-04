import { signatures } from '@gala-chain/api';

export function recoverAddressFromPublicKey(publicKey: string) {
  return signatures.getEthAddress(publicKey);
}

export function recoverPublicKeyFromSignature(
  signedObject: object & { signature: string; prefix?: string | undefined },
) {
  const { signature, ...rest } = signedObject;
  const publicKey = signatures.recoverPublicKey(
    signature,
    rest,
    signedObject.prefix,
  );
  return publicKey;
}

export function recoverWalletAddressFromSignature(
  signedObject: object & { signature: string },
) {
  const publicKey = recoverPublicKeyFromSignature(signedObject);
  return '0x' + recoverAddressFromPublicKey(publicKey);
}

export const removePrefixes = (prefixedString: string) => {
  return prefixedString
    .replace('eth|', '')
    .replace('client|', '')
    .replace('0x', '');
};

export function validateSignature<T extends { signature: string }>(object: T) {
  const publicKey = signatures.recoverPublicKey(object.signature, object, '');
  const gc_address = 'eth|' + signatures.getEthAddress(publicKey);
  return gc_address;
}
