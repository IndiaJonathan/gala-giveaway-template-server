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
  return recoverAddressFromPublicKey(publicKey);
}

export const removePrefixes = (prefixedString: string) => {
  return prefixedString
    .replace('eth|', '')
    .replace('client|', '')
    .replace('0x', '');
};
