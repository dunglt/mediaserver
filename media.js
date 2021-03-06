const config = require('config');
const mediasoup = require('mediasoup');
const RoomrtcServer = require('roomrtc');

const Peer = require('./peer');
const logger = require('./logger')('Media Room');

/**
 * MediaRoom
 */
module.exports = class MediaRoom extends RoomrtcServer {

    constructor(options) {
        super(options);

        this.logger = logger;
        this.mediaServer = null;
        this.mediaRooms = new Map();
        this.peers = {};

        // setup events listener
        this.on('connection', this.onClientConnect.bind(this));
        this.on('leave', this.onClientLeave.bind(this));
        this.on('join', this.onClientJoin.bind(this));

        this.on('message', this.onClientMessage.bind(this));
        this.on('command', this.onClientCommand.bind(this));
        // 
        this.logger.info('Config info ', this.config);

        if (this.config.autoInitServer) {
            let settings = config.get('mediaServerSettings');
            // init media server
            this.mediaServer = mediasoup.Server(settings);
            this.mediaServer.on('newroom', mediaRoom => {
                // A new room is created
                this.logger.info('A new media room is created');
            });
        }
    }

    /**
     * Get room by name
     * @param {String} name Name of the room
     */
    getMediaRoom(name) {
        return this.mediaRooms.get(name);
    }

    /**
     * Set media room by name
     * @param {String} name Name of the room
     * @param {MediaRoom} mediaRoom 
     */
    setMediaRoom(name, mediaRoom) {
        this.mediaRooms.set(name, mediaRoom);
        return mediaRoom;
    }

    /**
     * Get peer by id
     * @param {String} id 
     */
    getPeer(id) {
        this.logger.info('getPeer, id:', id);
        return this.peers[id];
    }

    /**
     * Set peer by id
     * @param {String} id 
     * @param {MediaPeer} peer 
     */
    setPeer(id, peer) {
        this.logger.info('setPeer, id:', id);
        this.peers[id] = peer;
        return peer;
    }

    /**
     * Create peer from Socket
     * @param {MediaRoom} mediaRoom 
     * @param {Socket} socket
     */
    createPeer(mediaRoom, socket) {
        let id = socket.id;
        let client = this.getPeer(id);
        this.cleanPeer(client);

        let mediaPeer = mediaRoom.Peer(id);
        let peer = new Peer({
            mediaRoom: mediaRoom,
            mediaPeer: mediaPeer,
            socket: socket
        });
        return peer;
    }

    cleanPeer(peer) {
        if (!peer) {
            return;
        }

        // Clean up
        this.logger.info('Close peer connection', peer.id);
        peer.close();

        // remove from properties
        delete this.peers[peer.id];
    }

    /**
     * Process client on connect
     * @param {Socket} client 
     */
    onClientConnect(client) {
        // send back welcome message
        this.logger.info('New client connect: ', client.id);
        client.send({
            type: 'welcome',
            message: 'Enjoy video conferencing !'
        });
    }

    /**
     * Process client on leave
     * @param {Socket} client 
     */
    onClientLeave(client) {
        this.logger.info('A client leave: ', client.id);

        let pid = client.id;
        let peer = this.getPeer(pid);
        this.cleanPeer(peer);
    }

    /**
     * Process client on join
     * @param {String} roomName 
     * @param {Socket} client 
     */
    onClientJoin(roomName, client) {
        this.logger.info('Client request to join room: ', client.id, roomName);

        // Create new peer and join room
        return Promise.resolve(1)
            .then(() => {
                let mediaRoom = this.getMediaRoom(roomName);
                if (!mediaRoom) {
                    let options = config.get('roomOptions');
                    // create new media room
                    return this.mediaServer.createRoom(options)
                        .then(roomCreated => {
                            // this.logger.info('Create room success: ', roomCreated);
                            this.setMediaRoom(roomName, roomCreated);
                            return roomCreated;
                        });
                } else {
                    // this.logger.info('Room created already: ', mediaRoom);
                    return mediaRoom;
                }
            })
            .then(mediaRoom => {
                let capabilities = config.get('peerCapabilities');
                let peer = this.createPeer(mediaRoom, client);
                // peer.mediaPeer.setCapabilities(capabilities);
                this.setPeer(client.id, peer);
                client.emit('ready', 'join me');
            })
            .catch(err => {
                this.logger.error('Create mediaRoom error', err);
            });
    }

    /**
     * Process message of client on receive
     * @param {Socket} client 
     * @param {Object} msg 
     */
    onClientMessage(client, msg) {
        this.logger.info('Client send a message: ', client.id, msg && msg.type);

        let peer = this.getPeer(client.id);
        peer.processMessage(msg);
    }

    /**
     * Process command of client on receive
     * @param {Socket} client 
     * @param {Object} cmd 
     */
    onClientCommand(client, cmd) {
        this.logger.info('Client send a command: ', client.id, cmd && cmd.type);

    }

}