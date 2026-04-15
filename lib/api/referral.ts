/**
 * Referral API
 * Read-only: fetch referral code, progress, and reward info from backend.
 * Refer & Earn: my-code, status, redeem endpoints.
 */

import { get, post } from '../api';
import type { ApiResponse } from '../api';

export type ReferralStatus = 'PENDING' | 'QUALIFIED' | 'REWARDED' | 'INVALID';

export interface ReferralItem {
  id: string;
  status: ReferralStatus;
  referredId: string;
  createdAt: string;
  qualifiedAt: string | null;
  rewardedAt: string | null;
}

export interface ReferralProgress {
  total: number;
  pending: number;
  qualified: number;
  rewarded: number;
}

export interface ReferralRewardInfo {
  rewardAmount: number;
  description: string;
}

export interface ReferralResponse {
  referralCode: string;
  referrals: ReferralItem[];
  progress: ReferralProgress;
  rewardInfo: ReferralRewardInfo | null;
}

/**
 * Get current user's referral data (passenger only).
 */
export async function getReferral(): Promise<{
  success: boolean;
  data?: ReferralResponse;
  error?: unknown;
}> {
  return get<ReferralResponse>('/api/referral');
}

// ---------------------------------------------------------------------------
// Refer & Earn: my-code, status, redeem
// ---------------------------------------------------------------------------

export interface MyCodeResponse {
  referralCode: string;
}

export interface ReferralStatusResponse {
  isRedeemed: boolean;
}

/**
 * Get current user's referral code (for Refer & Earn screen).
 */
export async function getMyReferralCode(): Promise<ApiResponse<MyCodeResponse>> {
  return get<MyCodeResponse>('/api/referral/my-code');
}

/**
 * Get whether the current user has already redeemed a referral code.
 */
export async function getReferralStatus(): Promise<
  ApiResponse<ReferralStatusResponse>
> {
  return get<ReferralStatusResponse>('/api/referral/status');
}

/**
 * Redeem a referral code. Returns success or error (e.g. ALREADY_REDEEMED, invalid code).
 */
export async function redeemReferralCode(
  referralCode: string
): Promise<ApiResponse<{ success: boolean }>> {
  return post<{ success: boolean }>('/api/referral/redeem', { referralCode });
}
