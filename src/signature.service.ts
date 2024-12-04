import { Injectable } from '@nestjs/common';
import { signatures } from '@gala-chain/api';

@Injectable()
export class SignatureService {
  validateSignature<T extends { signature: string }>(object: T) {
    const publicKey = signatures.recoverPublicKey(object.signature, object, '');
    const gc_address = 'eth|' + signatures.getEthAddress(publicKey);
    return gc_address;
  }
}
