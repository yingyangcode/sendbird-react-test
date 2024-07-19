import './App.css';
import React, { useEffect, useRef, useState } from 'react';
import SendBird from '@sendbird/chat';
import SendBirdDesk from 'sendbird-desk';
import { GroupChannelFilter, GroupChannelHandler, GroupChannelListOrder, GroupChannelModule, MessageCollectionInitPolicy, MessageFilter } from '@sendbird/chat/groupChannel';


const APP_ID = '780D920C-0AFC-44B7-9AAE-23E15F1B6F2E';
const USER_ID = '8119861bffc7ada46895983a2566bbd2b7091352e58c512d0e3bc586fc845fbc';
const ACCESS_TOKEN = '57350d5a38fc60f5f7eed9c93f40d6721ce855b4';
const DESK_API_TOKEN = '4d70e193513abc55590b5bac139b1a5a8bfc2bd7'

const initSendBird = async (sdk) => {
  try {
    const user = await sdk.connect(USER_ID, ACCESS_TOKEN);
    SendBirdDesk.init(sdk);
    await new Promise((resolve, reject) => {
      SendBirdDesk.authenticate(USER_ID, ACCESS_TOKEN, (res, error) => {
        if (error) {
          reject(error);
        } else {
          console.log('[initSendBird]>> SendbirdDesk authentication successful.');
          resolve()
        }
      });
    });
    return user
  } catch (err) {
    console.error(`[initSendBird]>> Failed to initialize SendBird: ${err}`);
    console.error(err);
  }
};

async function getTickets(params) {
  return new Promise((resolve, reject) => {
    SendBirdDesk.Ticket.getAllTickets(params.offset, (tickets, error) => {
          if (error) {
              reject(error);
          } else {
              resolve(tickets);
          }
      });
  });
}


async function getTicketByChannelUrl(channelUrl) {
  return new Promise((resolve, reject) => {
    SendBirdDesk.Ticket.getByChannelUrl(channelUrl, (ticket, err) => {
          if (err) {
              reject(err);
          } else {
              resolve(ticket);
          }
      })
  })
}

async function createTicket(title, userNickname, groupKey='') {
  return new Promise((resolve, reject) => {
    SendBirdDesk.Ticket.create(title, userNickname, groupKey, (ticket, err) => {
          if (err) {
              reject(err);
          } else {
              resolve(ticket);
          }
      });
  });
}

async function loadMessages(channel) {
  return new Promise((resolve, reject) => {
    const messageCollection = channel.createMessageCollection({});

    messageCollection.initialize(MessageCollectionInitPolicy.CACHE_AND_REPLACE_BY_API)
      .onApiResult((err, apiMessages) => {
        if (err) {
          reject(err)
        } else {
          const myMessages = apiMessages.sort((a, b) => a.createdAt - b.createdAt);
          resolve(myMessages)
        }
      });
  })
}

function App() {
  const [tickets, setTickets] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [currentChannel, setCurrentChannel] = useState(null);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [sdk] = useState(() => {
    return SendBird.init({
      appId: APP_ID,
      modules: [new GroupChannelModule()],
    })
  });

  const inputRef = useRef(null);

  useEffect(() => {
    setLoading(true)
    const fetchTickets = async () => {
      const userResponse = await initSendBird(sdk)
      const ticketResponse = await getTickets({offset: 0})
      setUser(userResponse)
      setTickets(ticketResponse)
    }
    try {
      fetchTickets();
    } catch (error) {
      console.log(`[useEffect][fetchTickets]>> ${JSON.stringify(error)}`)
    } finally {
      setLoading(false)
    }
  }, [sdk]);

  useEffect(() => {
    if (currentTicket) {
      const handler = new GroupChannelHandler();
      handler.onMessageReceived = async (channel, message) => {
        const messageTicket = await getTicketByChannelUrl(message.channelUrl);
        console.log(`[handleSelectTicket][onMessageReceived][message]>> ${JSON.stringify(message, null, 2)}`);
        console.log(`[handleSelectTicket][onMessageReceived][messageTicket]>> ${JSON.stringify(messageTicket, null, 2)}`);

        if (messageTicket.id === currentTicket.id) {
          setMessages((prevMessages) => [...prevMessages, message]);
        }
      };
      sdk.groupChannel.addGroupChannelHandler(currentTicket.channelUrl, handler);

      return () => {
        sdk.groupChannel.removeGroupChannelHandler(currentTicket.channelUrl);
      };
    }
  }, [sdk, currentTicket]);

  if (loading) {
    return <div>Loading...</div>
  }

  const handleCreateTicket = async () => {
    const ticketNum = ('000' + (new Date().getTime() % 1000)).slice(-3);
    const tempTicketTitle = `Issue #${ticketNum}`;
    const ticket = await createTicket(tempTicketTitle, user.nickname);
    console.log('Created Ticket', ticket);
    setTickets((prevTickets) => [...prevTickets, ticket]);
    handleSelectTicket(ticket);
  };

  const handleSelectTicket = async (selectedTicket) => {
    try {
      const selectedChannel = await sdk.groupChannel.getChannel(selectedTicket.channelUrl);
      setCurrentChannel(selectedChannel);
      setCurrentTicket(selectedTicket);

      const myMessages = await loadMessages(selectedChannel)
      // console.log('loadMessages', myMessages)
      setMessages(myMessages)

    } catch (error) {
      console.error(`[handleSelectTicket]>> ${JSON.stringify(error)}`)
    }
  };

  const sendMessage = async () => {
    if (messageText.trim() === '' || !currentChannel) return;

    const messageParams = {
      message: messageText,
    };

    currentChannel.sendUserMessage(messageParams)
      .onSucceeded((message) => {
        setMessages((prevMessages) => [...prevMessages, message]);
        setMessageText('');
      })
      .onFailed((error) => {
        console.error('Failed to send message:', JSON.stringify(error));
      });
  };
 
  return (
    <div className="App">
      <h1>SendBird Desk Tickets</h1>
      <button onClick={handleCreateTicket}>Create Ticket</button>
      <div style={{ height: '200px', overflowY: 'scroll' }}>
        <ul style={{listStyle: 'none', padding: 0}}>
          {tickets.map((ticket) => (
            <li key={ticket.id} onClick={() => handleSelectTicket(ticket)} style={{textAlign: 'center', cursor: 'pointer'}}>
              {ticket.title}
            </li>
          ))}
        </ul>
      </div>
      <hr />

      {currentChannel && (
        <div>
          <h2>Selected Ticket Messages</h2>
          {currentTicket &&  (
            <>
            <h4>Channel: {currentChannel?.name || ''}</h4>
            <h4>Agent: {currentTicket?.agent?.name || 'Unassigned'}</h4>
            <h4>Ticket Status: {currentTicket?.status || 'Unknown'}</h4>
            </>
          )}
          <div style={{ height: '300px', overflowY: 'scroll' }}>
            {messages.map((message) => (
              <div key={message.messageId}>
                <strong>{message.sender?.nickname}: </strong>
                {message.message}
              </div>
            ))}
          </div>
          <input
            ref={inputRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type a message"
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      )}
    </div>
  );
}

export default App;
