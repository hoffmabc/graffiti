import { useState } from 'react';
import { AddressPurpose, request, MessageSigningProtocols } from 'sats-connect';
import { generatePrivateKey, generatePubkeyFromPrivateKey, hexToUint8Array } from '../utils/cryptoHelpers';
import * as secp256k1 from 'noble-secp256k1';

interface WalletState {
  isConnected: boolean;
  publicKey: string | null;
  privateKey: string | null;
  address: string | null;
  walletType: string | null;
}

export function useWallet() {
  const NETWORK = import.meta.env.VITE_NETWORK || 'regtest';
  const [state, setState] = useState<WalletState>(() => {
    const savedState = localStorage.getItem('walletState');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return {
        isConnected: parsed.isConnected,
        publicKey: parsed.publicKey,
        privateKey: parsed.privateKey,
        address: parsed.address,
        walletType: parsed.walletType,
      };
    }
    return {
      isConnected: false,
      publicKey: null,
      privateKey: null,
      address: null,
      walletType: null,
    };
  });
  
  const connectRegtest = async () => {
    const privateKey = generatePrivateKey();
    const publicKey = generatePubkeyFromPrivateKey(privateKey);
    
    const newState = {
      isConnected: true,
      privateKey,
      publicKey: publicKey.toString(),
      address: null,
      walletType: 'regtest',
    };
    setState(newState);
    localStorage.setItem('walletState', JSON.stringify(newState));
  };
  
  const connect = async () => {
    if (NETWORK === 'development') {
      await connectRegtest();
      return;
    }
  
    try {
      // Check if we're on mobile
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      // Check for Xverse browser and wallet
      const isXverseBrowser = !!(window as any).XverseProviders.BitcoinProvider || !!(window as any).XverseProviders;
      const hasXverseWallet = !!(window as any).XverseProviders.BitcoinProvider?.request;
  
      if (isMobile && !isXverseBrowser) {
        if (window.confirm('You will be redirected to Xverse wallet to continue. Press OK to proceed.')) {
          const currentUrl = encodeURIComponent(window.location.href);
          window.location.href = `https://connect.xverse.app/browser?url=${currentUrl}`;
          
          // Fallback to custom URL scheme
          setTimeout(() => {
            window.location.href = `xverse://browser?url=${currentUrl}`;
          }, 1000);
        }
        return;
      }
  
      if (!hasXverseWallet) {
        const error = new Error('Xverse wallet is not installed. Please install Xverse wallet to continue.');
        error.name = 'WalletNotFoundError';
        throw error;
      }

      const res = await request('wallet_connect', {
        message: 'Graffiti Wall wants to know your addresses!',
        addresses: [AddressPurpose.Payment, AddressPurpose.Ordinals],
      });
  
      const addressResponse = await (window as any).XverseProviders.BitcoinProvider.request('getAddresses', {
        purposes: [AddressPurpose.Ordinals],
        message: 'Connect to Graffiti Wall',
      });

      if (addressResponse?.error) {
        throw new Error(addressResponse.error.message || 'Failed to get addresses from wallet');
      }
      
      if (!addressResponse?.result?.addresses?.[0]) {
        throw new Error('No addresses returned from wallet');
      }
  
      const ordinalsAddress = addressResponse.result.addresses.find(
        addr => addr.purpose === AddressPurpose.Ordinals
      );
  
      if (!ordinalsAddress) {
        throw new Error('No ordinals address returned');
      }
  
      const newState = {
        isConnected: true,
        address: ordinalsAddress.address,
        publicKey: ordinalsAddress.publicKey,
        privateKey: null,
        walletType: ordinalsAddress.walletType || 'software',
      };
  
      setState(newState);
      localStorage.setItem('walletState', JSON.stringify(newState));
    } catch (error) {
      console.error('Error connecting wallet:', error);
      
      // Clear any existing state
      setState({
        isConnected: false,
        publicKey: null,
        privateKey: null,
        address: null,
        walletType: null,
      });
      localStorage.removeItem('walletState');
  
      // Rethrow with more specific error message
      if (error instanceof Error) {
        if (error.name === 'WalletNotFoundError') {
          throw new Error('Please install Xverse wallet to continue. Visit https://www.xverse.app/download');
        }
        throw new Error(`Wallet connection failed: ${error.message}`);
      }
      throw error;
    }
  };
  
    const disconnect = () => {
      localStorage.removeItem('walletState');
      setState({
        isConnected: false,
        publicKey: null,
        privateKey: null,
        address: null,
        walletType: null,
      });
    };

    const signMessage = async (message: string): Promise<string> => {
      if (!state.isConnected) throw new Error('Wallet not connected');
    
      if (NETWORK === 'regtest' && state.privateKey) {
        try {
          const messageBytes = new TextEncoder().encode(message);
          const messageHash = await crypto.subtle.digest('SHA-256', messageBytes);
          const hashArray = new Uint8Array(messageHash);
          const privateKeyBytes = hexToUint8Array(state.privateKey);
          const signature = await secp256k1.sign(hashArray, privateKeyBytes);
          return Buffer.from(signature).toString('hex');
        } catch (error) {
          console.error('Error signing message:', error);
          throw new Error('Failed to sign message');
        }
      } else {
        console.debug(`Signing message: ${message}`);
        try {
            console.log(`Signing key: ${state.publicKey}`);
          const signResult = await request('signMessage', {              
            address: state.address!,
            message: message,
            protocol: MessageSigningProtocols.BIP322,
          });
          console.log(`Signature: ${signResult.result.signature}`);
          return signResult.result.signature;
        } catch (error) {
          console.error('Error signing with wallet:', error);
          throw error;
        }
      }
    };

  return {
    ...state,
    connect,
    disconnect,
    signMessage,
  };
}