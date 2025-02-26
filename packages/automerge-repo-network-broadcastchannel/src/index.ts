/**
 *
 * A `NetworkAdapter` which uses [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
 * to communicate with other peers in the same browser tab. This is a bit of a
 * hack because `NetworkAdapter`s are supposed to be used as point to
 * point communication channels. To get around this the {@link BroadcastChannelNetworkAdapter}
 * broadcasts messages to all peers and then filters out messages not intended
 * for the current peer. This is quite inefficient as messages get duplicated
 * for every peer in the tab, but as it's all local communication anyway
 * it's not too bad. If efficiency is becoming an issue you can switch to
 * `automerge-repo-network-messagechannel`.
 *
 * @module
 *
 */

import {
  NetworkAdapter,
  type Message,
  type PeerId,
  type PeerMetadata,
} from "@automerge/automerge-repo"

export type BroadcastChannelNetworkAdapterOptions = {
  channelName: string
}

export class BroadcastChannelNetworkAdapter extends NetworkAdapter {
  #broadcastChannel: BroadcastChannel

  #options: BroadcastChannelNetworkAdapterOptions

  constructor(options?: BroadcastChannelNetworkAdapterOptions) {
    super()
    this.#options = { channelName: "broadcast", ...(options ?? {}) }
  }

  connect(peerId: PeerId, peerMetadata: PeerMetadata) {
    this.peerId = peerId
    this.peerMetadata = peerMetadata
    this.#broadcastChannel = new BroadcastChannel(this.#options.channelName)

    this.#broadcastChannel.addEventListener(
      "message",
      (e: { data: BroadcastChannelMessage }) => {
        const message = e.data
        if ("targetId" in message && message.targetId !== this.peerId) {
          return
        }

        const { senderId, type } = message

        switch (type) {
          case "arrive":
            this.#broadcastChannel.postMessage({
              senderId: this.peerId,
              targetId: senderId,
              type: "welcome",
            })
            this.#announceConnection(senderId, peerMetadata)
            break
          case "welcome":
            this.#announceConnection(senderId, peerMetadata)
            break
          default:
            if (!("data" in message)) {
              this.emit("message", message)
            } else {
              this.emit("message", {
                ...message,
                data: new Uint8Array(message.data),
              })
            }
            break
        }
      }
    )

    this.#broadcastChannel.postMessage({
      senderId: this.peerId,
      type: "arrive",
    })

    this.emit("ready", { network: this })
  }

  #announceConnection(peerId: PeerId, peerMetadata: PeerMetadata) {
    this.emit("peer-candidate", { peerId, peerMetadata })
  }

  send(message: Message) {
    if ("data" in message) {
      this.#broadcastChannel.postMessage({
        ...message,
        data: message.data.buffer.slice(
          message.data.byteOffset,
          message.data.byteOffset + message.data.byteLength
        ),
      })
    } else {
      this.#broadcastChannel.postMessage(message)
    }
  }

  disconnect() {
    // TODO:
    throw new Error("Unimplemented: leave on BroadcastChannelNetworkAdapter")
  }
}

/** Notify the network that we have arrived so everyone knows our peer ID */
type ArriveMessage = {
  type: "arrive"

  /** The peer ID of the sender of this message */
  senderId: PeerId

  /** The peer metadata of the sender of this message */
  peerMetadata: PeerMetadata

  /** Arrive messages don't have a targetId */
  targetId: never
}

/** Respond to an arriving peer with our peer ID */
type WelcomeMessage = {
  type: "welcome"

  /** The peer ID of the recipient sender this message */
  senderId: PeerId

  /** The peer metadata of the sender of this message */
  peerMetadata: PeerMetadata

  /** The peer ID of the recipient of this message */
  targetId: PeerId
}

type BroadcastChannelMessage = ArriveMessage | WelcomeMessage | Message
