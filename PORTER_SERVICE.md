## Porter Service – Feature and Payment Documentation

### Overview

Porter service is the **package delivery** vertical in the app. It supports:

- **Roles**
  - **Passenger (Sender)**: creates porter requests and (optionally) pays.
  - **Driver**: sees nearby requests, accepts them, picks up and delivers packages.
- **Lifecycle**
  - `REQUESTED → ACCEPTED → PICKED_UP → IN_TRANSIT → DELIVERED / CANCELLED`
- **Location & tracking**
  - Pickup/delivery coordinates and addresses.
  - Live driver tracking and route display on a map.
- **Package metadata**
  - Type, dimensions, weight, description, fragile flag.
- **Payment**
  - Who pays: **SENDER** or **RECEIVER**.
  - Method: **WALLET**, **ONLINE**, or **CASH**.
  - Driver earnings, platform fee, Razorpay integration, wallet integration.

Key code locations:

- Core types & APIs: `lib/api/porter.ts`
- Active tracking (tab): `app/(tabs)/active-porter.tsx`
- Active tracking (modal): `components/modals/active-porter-modal.tsx`
- Details & payment status: `app/porter-details.tsx`
- Payment selection: `app/porter-payment.tsx`
- Payment hook: `hooks/usePorterPayment.ts`
- Status cards: `components/porter-status-card.tsx`

**Backend requirement:** When a porter service is created, the backend must create a corresponding `PorterPayment` record with `status: 'PENDING'`, `paymentMethod: null`, and the fare amounts. This ensures `getPorterPayment()` returns a record as soon as the service is delivered, so the payment screen loads correctly.

---

## Domain Model

### Status enum

Defined in `lib/api/porter.ts`:

```ts
export enum PorterStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}
```

- **REQUESTED**: customer submitted a porter request, waiting for a driver.
- **ACCEPTED**: a driver has accepted the request.
- **PICKED_UP**: driver has collected the package from the pickup contact.
- **IN_TRANSIT**: driver is traveling towards the delivery address.
- **DELIVERED**: delivery completed (payment may still be pending).
- **CANCELLED**: service cancelled by customer, driver, or system.

Helper functions:

- `isPorterServiceActive(status)` – `true` for all except `DELIVERED`, `CANCELLED`.
- `canCustomerCancel(status)` – allowed when status is `REQUESTED` or `ACCEPTED`.
- `canDriverCancel(status)` – allowed when status is `ACCEPTED`.
- `getNextDriverStatus(currentStatus)`:
  - `ACCEPTED → PICKED_UP`
  - `PICKED_UP → IN_TRANSIT`
  - `IN_TRANSIT → DELIVERED`
- `getDriverActionLabel(currentStatus)`:
  - `ACCEPTED → "Mark as Picked Up"`
  - `PICKED_UP → "Mark as In Transit"`
  - `IN_TRANSIT → "Mark as Delivered"`

### PorterServiceResponse

Defined in `lib/api/porter.ts` as `PorterServiceResponse`. Important fields:

- **Identity & roles**
  - `id`, `customerId`, `driverId?`
  - `customer?: PassengerProfile`
  - `driver?: DriverProfile | null`
- **Status & timestamps**
  - `status: PorterStatus`
  - `requestedAt`, `acceptedAt`, `pickedUpAt`, `inTransitAt`,
    `deliveredAt`, `cancelledAt`
  - `cancellationReason?`, `cancelledBy?`
- **Pickup & delivery**
  - Pickup: `pickupLatitude`, `pickupLongitude`, `pickupLocation`,
    `pickupContactName`, `pickupContactPhone`
  - Delivery: `deliveryLatitude`, `deliveryLongitude`, `deliveryLocation`,
    `deliveryContactName`, `deliveryContactPhone`
- **Package**
  - `packageType: PackageType` (`DOCUMENT`, `FOOD`, `ELECTRONICS`, `FURNITURE`, `CLOTHING`, `OTHER`)
  - `packageWeight?`, `packageDimensions?`, `packageDescription?`
  - `isFragile: boolean`
- **Pricing**
  - `fare` (total)
  - `baseFare`
  - `weightCharge?`
  - `distance?`
- **Verification**
  - `verificationCode?`
  - `verificationCodeExpiresAt?`
- **Payment responsibility**
  - `paymentParty: 'SENDER' | 'RECEIVER'`

---

## API Layer – Porter Service

Location: `lib/api/porter.ts`.

### Passenger APIs

- **Create porter service**

  ```ts
  createPorterService(data: CreatePorterRequest)
  // POST /api/porter/request
  ```

  `CreatePorterRequest` includes:

  - Pickup & delivery coordinates and addresses.
  - Pickup/delivery contact names and phones.
  - Package details (type, weight, dimensions, description, fragile).
  - Vehicle type / subcategory.
  - Optional `paymentParty` (`SENDER` or `RECEIVER`).

- **Nearby drivers**

  ```ts
  getNearbyDriversForPorter(latitude, longitude, vehicleType?, radius?, vehicleSubcategoryId?)
  // GET /api/porter/nearby-drivers
  ```

### Driver APIs

- **Pending porter requests around driver**

  ```ts
  getPendingPorterServices(latitude, longitude, radius?)
  // GET /api/porter/pending
  ```

- **Accept a request**

  ```ts
  acceptPorterService(porterServiceId)
  // POST /api/porter/:id/accept
  ```

### Shared APIs

- **Get current active porter service**

  ```ts
  getActivePorterService()
  // GET /api/porter/active
  ```

- **Get service by ID**

  ```ts
  getPorterServiceById(porterServiceId)
  // GET /api/porter/:id
  ```

- **Update status (driver progression)**

  ```ts
  updatePorterStatus(porterServiceId, status: PorterStatus, verificationCode?)
  // PATCH /api/porter/:id/status
  ```

- **Cancel service**

  ```ts
  cancelPorterService(porterServiceId, reason?)
  // POST /api/porter/:id/cancel
  ```

- **Fetch history**

  ```ts
  getPorterServiceHistory(page = 1, limit = 20)
  // GET /api/porter/history
  ```

---

## UX & Screen Flow

### Creating a Porter Request

Screen: `app/(tabs)/create-porter.tsx` (not fully documented here).

- Passenger selects:
  - Pickup and delivery locations.
  - Contact details for pickup and delivery.
  - Package type, weight, dimensions, description, `isFragile`.
  - Vehicle type and optional payment party.
- Calls `createPorterService`, backend calculates `fare`, and returns a `PorterServiceResponse` with `REQUESTED` status.

### Driver Discovering and Accepting Jobs

Components:

- `PorterStatusCardCompact` (`components/porter-status-card.tsx`) presents each job.
- `getPendingPorterServices` fetches nearby jobs.

Flow:

- Driver sees list of pending porter services nearby.
- Tapping “Accept” triggers `acceptPorterService(id)`.
- Service status transitions to `ACCEPTED` and driver is assigned.

### Active Porter Tracking

Two main UIs:

- **Tab screen**: `app/(tabs)/active-porter.tsx`
- **Modal overlay**: `components/modals/active-porter-modal.tsx`

Common responsibilities:

- On mount / focus:
  - Call `getActivePorterService()` to load the current job.
  - Subscribe to realtime updates via `useActivePorterTracking`.
  - For drivers, track their own GPS via `useWatchLocation`.
- Render `ServiceMap`:
  - Pickup and delivery markers.
  - Driver marker from realtime or self-location.
  - Route lines via `getRoute`, depending on current status:
    - `ACCEPTED`: driver → pickup.
    - `PICKED_UP`: driver → delivery.
    - `IN_TRANSIT`: pickup → delivery.

Status-driven behavior:

- `REQUESTED`:
  - Show “Finding driver” UI.
- `ACCEPTED`:
  - Driver is heading to pickup; passenger sees assigned driver details.
- `PICKED_UP`:
  - Package collected; heading to delivery.
- `IN_TRANSIT`:
  - Package en route to delivery location.
- `DELIVERED`:
  - Show final fare, thank-you text; payment handling shifts to `porter-details` / `porter-payment`.
- `CANCELLED`:
  - Show cancellation reason and basic summary.

Driver action button:

- Uses `getDriverActionLabel(porterService.status)` for text.
- On press:
  - Computes `nextStatus = getNextDriverStatus(currentStatus)`.
  - For `ACCEPTED → PICKED_UP`, may require a verification code:
    - Passenger sees `VerificationCodeDisplay`.
    - Driver sees `VerificationCodeInput` and must enter code before status advances.
  - Calls `updatePorterStatus(id, nextStatus, verificationCode?)`.

Cancellation:

- If `canCustomerCancel(status)` or `canDriverCancel(status)`:
  - Show “Cancel Service” button.
  - Confirm via `Alert`.
  - Call `cancelPorterService(id, reason?)`, then:
    - Clear local service state.
    - Close modal or navigate back to tabs.
    - Dispatch `dispatchServiceCompleted()` so other parts of the app (e.g. active cards) update.

### Porter Details Screen

Screen: `app/porter-details.tsx`.

Entry points:

- From active flow when service becomes `DELIVERED`.
- From deep-link or history: `/porter-details?id=<porterServiceId>`.

Responsibilities:

- Fetch full service via `getPorterServiceById(id)`.
- Render:
  - Status badge (`DELIVERED`, `CANCELLED`, etc.).
  - Fragile and other package flags.
  - Pickup/delivery addresses, contacts, times.
  - Package details (type, weight, dimensions, description).
  - Fare breakdown:
    - Base fare.
    - Distance-based portion.
    - Weight charge.
    - Total.
- Integrate `usePorterPayment` to display payment state and controls:
  - Who pays (`paymentParty`).
  - Whether current user is `passenger` or `driver`.
  - Payment banners and action buttons (see below).
- Download links:
  - Receipt and invoice for delivered + paid services.
- Support:
  - Contact driver.
  - Report issue.
  - Customer support entry.

---

## Payment Architecture

Payment logic is centralized in:

- `lib/api/porter.ts` (types and API calls).
- `hooks/usePorterPayment.ts` (client state + orchestration).
- `app/porter-payment.tsx` (UI for choosing and executing payments).
- `app/porter-details.tsx` (status-driven payment interactions).

### PorterPayment type

Defined in `lib/api/porter.ts`:

```ts
export interface PorterPayment {
  id: string;
  porterServiceId: string;
  paymentMethod: PaymentMethod | null; // 'WALLET' | 'ONLINE' | 'CASH'
  status: 'PENDING' | 'AWAITING_ONLINE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fareAmount: number;
  platformFeeAmount: number;
  driverEarningAmount: number;
  processedAt: string | null;
}
```

- `fareAmount` – amount the payer owes.
- `platformFeeAmount` – cut retained by the platform.
- `driverEarningAmount` – what the driver earns.
- `status` – the backend’s canonical payment state.

### Payment APIs

All routes are under `/api/porter/:porterServiceId/payment...`.

- **Get payment**

  ```ts
  getPorterPayment(porterServiceId)
  // GET /api/porter/:id/payment
  ```

- **Select payment method (customer)**

  ```ts
  selectPorterPaymentMethod(porterServiceId, method)
  // POST /api/porter/:id/payment/select-method
  ```

  Returns:

  - `payment` – updated payment state.
  - Optional `order` – for ONLINE method (Razorpay).

- **Process wallet (customer)**

  ```ts
  processPorterWalletPayment(porterServiceId)
  // POST /api/porter/:id/payment/pay
  ```

- **Confirm cash (driver)**

  ```ts
  confirmPorterCashPayment(porterServiceId)
  // POST /api/porter/:id/payment/confirm-cash
  ```

- **Create online payment order (customer)**

  ```ts
  createPorterPaymentOrder(porterServiceId)
  // POST /api/porter/:id/payment/create-order
  ```

- **Check if driver can accept cash**

  ```ts
  canDriverAcceptCashForPorter(porterServiceId)
  // GET /api/porter/:id/payment/can-pay-cash
  ```

- **Create QR payment order for receiver-pays (driver)**

  ```ts
  createReceiverQROrder(porterServiceId)
  // POST /api/porter/:id/payment/receiver-qr-order
  ```

### usePorterPayment Hook

File: `hooks/usePorterPayment.ts`.

**Inputs:**

- `porterServiceId: string`
- `autoFetch?: boolean` – defaults to `true`.
- `pollingInterval?: number` – defaults to `2000ms`.

**State:**

- `payment: PorterPayment | null`
- `walletBalance: number`
- `loading: boolean`
- `error: string | null`
- `canPayWithWallet: boolean` – `walletBalance >= payment.fareAmount`.
- `isPaymentComplete: boolean` – `payment?.status === 'COMPLETED'`.
- `isPaymentPending: boolean` – status `PENDING` or `AWAITING_ONLINE`.
- `isPolling: boolean` – whether background polling is running.

**Actions:**

- `refresh()` – refetch wallet balance and payment.
- `selectPaymentMethod(method)` – select WALLET / ONLINE / CASH.
- `processWalletPayment()` – explicitly process wallet debit.
- `confirmCashPayment()` – driver confirms receipt of cash.
- `createOnlinePaymentOrder()` – create Razorpay order and open checkout.
- `startPolling()` / `stopPolling()` – poll `/payment` until backend status finalizes.

**Key behaviors:**

- On mount (`autoFetch = true`):
  - Fetch wallet balance via `getWalletBalance`.
  - Fetch current porter payment via `getPorterPayment`.
- WALLET:
  - `selectPaymentMethod('WALLET')`:
    - Calls backend to set method.
    - Automatically triggers `processWalletPayment`.
    - On success, refreshes wallet balance and updates payment state.
- CASH:
  - `selectPaymentMethod('CASH')` sets payment to a cash flow.
  - Driver later calls `confirmCashPayment()` to complete.
- ONLINE:
  - `createOnlinePaymentOrder()`:
    - Calls `createPorterPaymentOrder` to get a `PaymentOrder`.
    - Opens Razorpay via `openCheckout`.
    - On client success:
      - Starts polling backend with `startPolling()` until payment becomes `COMPLETED` or `FAILED`.
- Polling:
  - `startPolling` sets an interval which repeatedly calls `getPorterPayment`.
  - Stops when:
    - Payment status is `COMPLETED` or `FAILED`, or
    - `stopPolling` is called, or
    - Component unmounts.

Backend is always the **source of truth**; the Razorpay client result alone is never trusted.

### Porter Payment Screen

File: `app/porter-payment.tsx`.

Used by the **SENDER** (passenger) when `paymentParty === 'SENDER'`:

- Loads `usePorterPayment({ porterServiceId, autoFetch: true })`.
- Shows:
  - Fare summary (total fare, driver earning, platform fee).
  - Wallet balance.
  - Info banner: driver is waiting for payment confirmation.
  - Three payment method options:
    - **Wallet** – disabled if `!canPayWithWallet`.
    - **Online Payment** – always available.
    - **Cash** – pay driver directly.

Button behavior:

- If **WALLET**:
  - Calls `selectPaymentMethod('WALLET')`.
  - Hook auto-runs wallet payment.
  - On success, navigates back.
- If **ONLINE**:
  - Calls `createOnlinePaymentOrder()`.
  - Opens Razorpay, starts polling.
  - Navigates back after starting the flow.
- If **CASH**:
  - Calls `selectPaymentMethod('CASH')`.
  - Marks that sender will pay cash to driver.
  - Navigates back.

Additionally, when `isPaymentComplete` becomes `true`, the screen auto-navigates back.

### Payment Scenarios by paymentParty

#### paymentParty = 'SENDER'

- **Passenger (sender)**:
  - After `DELIVERED`, sees “Payment Required” section on `porter-details` or gets sent to `porter-payment`.
  - Chooses WALLET / ONLINE / CASH.
  - Must complete payment for full flow to finish.

- **Driver**:
  - On `porter-details`, sees:
    - “Waiting for Payment” banner while payment is pending.
    - If method is CASH and `status === PENDING`:
      - “Confirm Cash Payment” button, which calls `confirmCashPayment()`.

#### paymentParty = 'RECEIVER'

- **Passenger (sender)**:
  - On `porter-details`, sees informational banner:
    - Receiver will pay `fareAmount` on delivery.
  - No direct payment actions.

- **Driver**:
  - On `porter-details` while payment is pending:
    - “Collect Payment from Receiver” section with:
      - Confirm cash (uses `confirmCashPayment()`).
      - Generate QR payment (uses `createReceiverQROrder` to get `checkoutUrl`, displays QR, starts polling).

---

## Summary

- Porter service is a full package-delivery vertical built on a clear status machine (`PorterStatus`) and a rich `PorterServiceResponse` model.
- Passenger and driver UIs share this model but expose different actions:
  - Passenger: create requests, see status, and (depending on `paymentParty`) pay.
  - Driver: discover nearby jobs, accept, advance status, and collect/confirm payments.
- Realtime tracking (`useActivePorterTracking` + `useWatchLocation`) keeps both sides updated on the driver’s position and route.
- Payment is backend-driven, with:
  - A single `PorterPayment` record per service.
  - Hook-based orchestration (`usePorterPayment`) for wallet, cash, and online flows.
  - Razorpay integrated via orders and polling to ensure the backend’s view of success is authoritative.

