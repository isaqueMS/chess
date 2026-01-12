
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Color = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Board = (Piece | null)[][];

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
}

export enum GameMode {
  LOCAL = 'LOCAL',
  AI = 'AI',
  ONLINE = 'ONLINE'
}

export interface GameSession {
  id: string;
  mode: GameMode;
  hostColor: Color;
  status: 'waiting' | 'playing' | 'ended';
}

export interface User {
  id: string;
  name: string;
  elo: number;
  avatar: string;
}

// Fixed: Added global window type definition for PeerJS to avoid "Property 'Peer' does not exist" errors
declare global {
  interface Window {
    Peer: any;
  }
}
