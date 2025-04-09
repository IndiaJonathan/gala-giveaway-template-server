import { signatures } from '@gala-chain/api';
import { getAddress } from 'ethers';
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
  return getAddress(recoverAddressFromPublicKey(publicKey));
}

export const removePrefixes = (prefixedString: string) => {
  return prefixedString
    .replace('eth|', '')
    .replace('client|', '')
    .replace('0x', '');
};

export function validateSignature<
  T extends { signature: string; prefix?: string },
>(object: T) {
  const publicKey = recoverPublicKeyFromSignature(object);
  const ethAddress = getAddress(signatures.getEthAddress(publicKey));
  return ethAddress;
}
