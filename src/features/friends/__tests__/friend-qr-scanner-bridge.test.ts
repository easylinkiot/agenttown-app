import {
  publishPendingFriendQrPayload,
  subscribePendingFriendQrPayload,
} from "../friend-qr-scanner-bridge";

describe("friend qr scanner bridge", () => {
  it("delivers a pending payload to the next subscriber", () => {
    publishPendingFriendQrPayload("fq1.pending.signature");

    const listener = jest.fn();
    const unsubscribe = subscribePendingFriendQrPayload(listener);

    expect(listener).toHaveBeenCalledWith("fq1.pending.signature");
    unsubscribe();
  });

  it("delivers live payloads to active subscribers", () => {
    const listener = jest.fn();
    const unsubscribe = subscribePendingFriendQrPayload(listener);

    publishPendingFriendQrPayload("fq1.live.signature");

    expect(listener).toHaveBeenCalledWith("fq1.live.signature");
    unsubscribe();
  });

  it("does not replay a consumed payload to later subscribers", () => {
    const firstListener = jest.fn();
    const firstUnsubscribe = subscribePendingFriendQrPayload(firstListener);

    publishPendingFriendQrPayload("fq1.once.signature");
    firstUnsubscribe();

    const secondListener = jest.fn();
    const secondUnsubscribe = subscribePendingFriendQrPayload(secondListener);

    expect(firstListener).toHaveBeenCalledWith("fq1.once.signature");
    expect(secondListener).not.toHaveBeenCalled();
    secondUnsubscribe();
  });
});
