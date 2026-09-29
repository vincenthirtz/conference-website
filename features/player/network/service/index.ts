// features/player/network/service — services du réseau de la joueuse (lot P15).
export type { NetworkCtx } from './context';
export {
  getMyDiscoveryCard,
  readSocialProfile,
  searchDirectory,
  toDiscoveryCard,
  updateMyDiscoveryCard,
} from './discovery';
export { follow, listFollows, unfollow } from './follows';
export { readHeadToHead } from './headToHead';
export { readScoutingReport } from './scouting';
export { readNetworkStatus } from './status';
