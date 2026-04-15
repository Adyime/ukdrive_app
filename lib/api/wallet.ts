/**
 * Wallet API
 * Handles all wallet-related API calls
 */

import { get, post, del } from '../api';

// ============================================
// Types
// ============================================

export interface WalletBalance {
  balance: number;
  formattedBalance: string;
  walletId: string;
  isActive: boolean;
}

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export type WalletTransactionType =
  | 'CREDIT_TOPUP'
  | 'CREDIT_RIDE_EARNING'
  | 'CREDIT_PORTER_EARNING'
  | 'CREDIT_CARPOOL_EARNING'
  | 'CREDIT_ADMIN'
  | 'CREDIT_REWARD'
  | 'DEBIT_RIDE_PAYMENT'
  | 'DEBIT_PORTER_PAYMENT'
  | 'DEBIT_CARPOOL_PAYMENT'
  | 'DEBIT_PLATFORM_FEE'
  | 'DEBIT_WITHDRAWAL';

export interface WalletTransactionsResponse {
  transactions: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CashStatus {
  canAcceptCash: boolean;
  currentBalance: number;
  minimumRequired: number;
  shortfall: number;
}

export interface BankDetails {
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
  bankName?: string;
}

export type WithdrawalMethod = 'UPI' | 'BANK';

export type WithdrawalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'TRANSFER_INITIATED'
  | 'COMPLETED'
  | 'TRANSFER_FAILED';

export interface Withdrawal {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  withdrawalMethod: WithdrawalMethod;
  upiId: string | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankAccountHolder: string | null;
  bankName: string | null;
  processedAt: string | null;
  rejectionReason: string | null;
  transferMode: string | null;
  transferReference: string | null;
  transferredAt: string | null;
  transferFailReason: string | null;
  createdAt: string;
}

export interface WithdrawalsResponse {
  withdrawals: Withdrawal[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface WithdrawalRequestPayload {
  withdrawalMethod: WithdrawalMethod;
  upiId?: string;
  bankDetails?: BankDetails;
}

// ============================================
// Balance API Functions
// ============================================

/**
 * Get current wallet balance
 */
export async function getWalletBalance(): Promise<{
  success: boolean;
  data?: WalletBalance;
  error?: unknown;
}> {
  return get<WalletBalance>('/api/wallet/balance');
}

/**
 * Get wallet transaction history
 */
export async function getWalletTransactions(
  page: number = 1,
  limit: number = 20,
  type?: WalletTransactionType,
  referenceType?: string
): Promise<{
  success: boolean;
  data?: WalletTransactionsResponse;
  error?: unknown;
}> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (type) {
    params.append('type', type);
  }

  if (referenceType) {
    params.append('referenceType', referenceType);
  }

  return get<WalletTransactionsResponse>(`/api/wallet/transactions?${params.toString()}`);
}

// ============================================
// Driver-Specific API Functions
// ============================================

/**
 * Check if driver can accept cash rides (has minimum balance)
 * Driver only
 */
export async function getCashStatus(): Promise<{
  success: boolean;
  data?: CashStatus;
  error?: unknown;
}> {
  return get<CashStatus>('/api/wallet/cash-status');
}

// ============================================
// Withdrawal API Functions (Driver only)
// ============================================

/**
 * Request a withdrawal
 * Driver only
 */
export async function requestWithdrawal(
  amount: number,
  payload: WithdrawalRequestPayload
): Promise<{
  success: boolean;
  data?: { withdrawal: Withdrawal };
  error?: unknown;
  message?: string;
}> {
  return post<{ withdrawal: Withdrawal }>('/api/wallet/withdrawals/request', {
    amount,
    ...payload,
  });
}

/**
 * Get withdrawal history
 * Driver only
 */
export async function getWithdrawals(
  page: number = 1,
  limit: number = 20,
  status?: WithdrawalStatus
): Promise<{
  success: boolean;
  data?: WithdrawalsResponse;
  error?: unknown;
}> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (status) {
    params.append('status', status);
  }

  return get<WithdrawalsResponse>(`/api/wallet/withdrawals?${params.toString()}`);
}

/**
 * Get withdrawal details by ID
 * Driver only
 */
export async function getWithdrawalById(
  withdrawalId: string
): Promise<{
  success: boolean;
  data?: { withdrawal: Withdrawal };
  error?: unknown;
}> {
  return get<{ withdrawal: Withdrawal }>(`/api/wallet/withdrawals/${withdrawalId}`);
}

/**
 * Cancel a pending withdrawal
 * Driver only
 */
export async function cancelWithdrawal(
  withdrawalId: string
): Promise<{
  success: boolean;
  data?: { withdrawal: Withdrawal };
  error?: unknown;
  message?: string;
}> {
  return del<{ withdrawal: Withdrawal }>(`/api/wallet/withdrawals/${withdrawalId}`);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format amount as Indian Rupees
 */
export function formatAmount(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

/**
 * Get human-readable transaction type label
 */
export function getTransactionTypeLabel(type: WalletTransactionType): string {
  const labels: Record<WalletTransactionType, string> = {
    CREDIT_TOPUP: 'Wallet Top-up',
    CREDIT_RIDE_EARNING: 'Ride Earning',
    CREDIT_PORTER_EARNING: 'Parcel Earning',
    CREDIT_CARPOOL_EARNING: 'Ride Share Earning',
    CREDIT_ADMIN: 'Admin Credit',
    CREDIT_REWARD: 'Reward Credit',
    DEBIT_RIDE_PAYMENT: 'Ride Payment',
    DEBIT_PORTER_PAYMENT: 'Parcel Payment',
    DEBIT_CARPOOL_PAYMENT: 'Ride Share Payment',
    DEBIT_PLATFORM_FEE: 'Platform Fee',
    DEBIT_WITHDRAWAL: 'Withdrawal',
  };
  return labels[type] || type;
}

/**
 * Check if transaction is a credit (incoming)
 */
export function isCredit(type: WalletTransactionType): boolean {
  return type.startsWith('CREDIT_');
}

/**
 * Get withdrawal status label
 */
export function getWithdrawalStatusLabel(status: WithdrawalStatus): string {
  const labels: Record<WithdrawalStatus, string> = {
    PENDING: 'Pending Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    TRANSFER_INITIATED: 'Transfer in Progress',
    COMPLETED: 'Completed',
    TRANSFER_FAILED: 'Transfer Failed',
  };
  return labels[status] || status;
}

/**
 * Get withdrawal status color for UI
 */
export function getWithdrawalStatusColor(status: WithdrawalStatus): string {
  const colors: Record<WithdrawalStatus, string> = {
    PENDING: '#f59e0b', // amber
    APPROVED: '#3b82f6', // blue
    REJECTED: '#ef4444', // red
    TRANSFER_INITIATED: '#3b82f6', // blue
    COMPLETED: '#22c55e', // green
    TRANSFER_FAILED: '#ef4444', // red
  };
  return colors[status] || '#6b7280';
}
