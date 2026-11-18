/**
 * TypeScript declaration for the pure .mjs validator, shared by Node
 * and Edge without bundling Garmin tokens into the client app.
 */
export declare function isGarminCloudSession(input: unknown): boolean;
export declare function tokenChanged(before: unknown, after: unknown): boolean;
