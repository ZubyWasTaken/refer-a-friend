export interface User {
    id: string;
    guild_id: string;
    role_id: string;
    invites_remaining: number;
  }
  
  export interface Role {
    id: string;
    guild_id: string;
    role_id: string;
    max_invites: number;
  }