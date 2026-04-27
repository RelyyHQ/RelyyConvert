package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
	"sync"
)

type wsClient struct {
	conn net.Conn
	r    *bufio.Reader
	mu   sync.Mutex
}

func dialNeutralino(port string, extID string, connectToken string) (*wsClient, error) {
	keyBytes := make([]byte, 16)
	if _, err := rand.Read(keyBytes); err != nil {
		return nil, err
	}
	key := base64.StdEncoding.EncodeToString(keyBytes)
	path := "/?" + url.Values{
		"extensionId":  {extID},
		"connectToken": {connectToken},
	}.Encode()

	conn, err := net.Dial("tcp", "127.0.0.1:"+port)
	if err != nil {
		return nil, err
	}

	req := strings.Join([]string{
		"GET " + path + " HTTP/1.1",
		"Host: 127.0.0.1:" + port,
		"Upgrade: websocket",
		"Connection: Upgrade",
		"Sec-WebSocket-Key: " + key,
		"Sec-WebSocket-Version: 13",
		"",
		"",
	}, "\r\n")
	if _, err := io.WriteString(conn, req); err != nil {
		conn.Close()
		return nil, err
	}

	reader := bufio.NewReader(conn)
	status, err := reader.ReadString('\n')
	if err != nil {
		conn.Close()
		return nil, err
	}
	if !strings.Contains(status, "101") {
		conn.Close()
		return nil, fmt.Errorf("unexpected websocket status: %s", strings.TrimSpace(status))
	}

	headers := map[string]string{}
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			conn.Close()
			return nil, err
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			headers[strings.ToLower(strings.TrimSpace(parts[0]))] = strings.TrimSpace(parts[1])
		}
	}

	if got := headers["sec-websocket-accept"]; got != websocketAccept(key) {
		conn.Close()
		return nil, fmt.Errorf("invalid websocket accept header")
	}

	return &wsClient{conn: conn, r: reader}, nil
}

func websocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func (c *wsClient) Close() error {
	return c.conn.Close()
}

func (c *wsClient) ReadText() ([]byte, error) {
	for {
		b0, err := c.r.ReadByte()
		if err != nil {
			return nil, err
		}
		b1, err := c.r.ReadByte()
		if err != nil {
			return nil, err
		}
		opcode := b0 & 0x0f
		masked := b1&0x80 != 0
		length := uint64(b1 & 0x7f)
		if length == 126 {
			var buf [2]byte
			if _, err := io.ReadFull(c.r, buf[:]); err != nil {
				return nil, err
			}
			length = uint64(binary.BigEndian.Uint16(buf[:]))
		} else if length == 127 {
			var buf [8]byte
			if _, err := io.ReadFull(c.r, buf[:]); err != nil {
				return nil, err
			}
			length = binary.BigEndian.Uint64(buf[:])
		}

		var mask [4]byte
		if masked {
			if _, err := io.ReadFull(c.r, mask[:]); err != nil {
				return nil, err
			}
		}

		payload := make([]byte, length)
		if _, err := io.ReadFull(c.r, payload); err != nil {
			return nil, err
		}
		if masked {
			for i := range payload {
				payload[i] ^= mask[i%4]
			}
		}

		switch opcode {
		case 1:
			return payload, nil
		case 8:
			return nil, io.EOF
		case 9:
			_ = c.writeFrame(10, payload)
		}
	}
}

func (c *wsClient) SendJSON(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.writeFrame(1, data)
}

func (c *wsClient) writeFrame(opcode byte, payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	header := []byte{0x80 | opcode}
	n := len(payload)
	if n < 126 {
		header = append(header, 0x80|byte(n))
	} else if n <= 65535 {
		header = append(header, 0x80|126, byte(n>>8), byte(n))
	} else {
		header = append(header, 0x80|127)
		var lenBuf [8]byte
		binary.BigEndian.PutUint64(lenBuf[:], uint64(n))
		header = append(header, lenBuf[:]...)
	}

	var mask [4]byte
	if _, err := rand.Read(mask[:]); err != nil {
		return err
	}
	header = append(header, mask[:]...)
	masked := make([]byte, n)
	for i := range payload {
		masked[i] = payload[i] ^ mask[i%4]
	}

	if _, err := c.conn.Write(header); err != nil {
		return err
	}
	_, err := c.conn.Write(masked)
	return err
}

func uuidV4() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		binary.BigEndian.Uint32(b[0:4]),
		binary.BigEndian.Uint16(b[4:6]),
		binary.BigEndian.Uint16(b[6:8]),
		binary.BigEndian.Uint16(b[8:10]),
		b[10:16],
	)
}
