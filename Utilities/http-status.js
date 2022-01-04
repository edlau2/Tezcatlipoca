

const HttpStatusEnum = new Map()
  .set(100, {
    name: `Continue`,
    desc: `The server has received the request headers, and the client should proceed to send the request body`
  })
  .set(101, {
    name: `Switching Protocols`,
    desc: `The requester has asked the server to switch protocols`
  })
  .set(103, {
    name: `Checkpoint`,
    desc: `Used in the resumable requests proposal to resume aborted PUT or POST requests`
  })
  .set(200, {
    name: `OK`,
    desc: `The request is OK (this is the standard response for successful HTTP requests)`
  })
  .set(201, {
    name: `Created`,
    desc: `The request has been fulfilled`
  })
  .set(202, {
    name: `Accepted`,
    desc: `The request has been accepted for processing`
  })
  .set(203, {
    name: `Non-Authoritative Information`,
    desc: `The request has been successfully processed`
  })
  .set(204, {
    name: `No Content`,
    desc: `The request has been successfully processed`
  })
  .set(205, {
    name: `Reset Content`,
    desc: `The request has been successfully processed`
  })
  .set(206, {
    name: `Partial Content`,
    desc: `The server is delivering only part of the resource due to a range header sent by the client`
  })
  .set(400, {
    name: `Bad Request`,
    desc: `The request cannot be fulfilled due to bad syntax`
  })
  .set(401, {
    name: `Unauthorized`,
    desc: `The request was a legal request`
  })
  .set(402, {
    name: `Payment Required`,
    desc: `Reserved for future use`
  })
  .set(403, {
    name: `Forbidden`,
    desc: `You don’t have permission to access [directory] on this server`
  })
  .set(404, {
    name: `Not Found`,
    desc: `The requested page could not be found but may be available again in the future`
  })
  .set(405, {
    name: `Method Not Allowed`,
    desc: `A request was made of a page using a request method not supported by that page`
  })
  .set(406, {
    name: `Not Acceptable`,
    desc: `The server can only generate a response that is not accepted by the client`
  })
  .set(407, {
    name: `Proxy Authentication Required`,
    desc: `The client must first authenticate itself with the proxy`
  })
  .set(408, {
    name: `Request`,
    desc: ` Timeout\tThe server timed out waiting for the request`
  })
  .set(409, {
    name: `Conflict`,
    desc: `The request could not be completed because of a conflict in the request`
  })
  .set(410, {
    name: `Gone`,
    desc: `The requested page is no longer available`
  })
  .set(411, {
    name: `Length Required`,
    desc: `The "Content-Length" is not defined. The server will not accept the request without it`
  })
  .set(412, {
    name: `Precondition`,
    desc: ` Failed. The precondition given in the request evaluated to false by the server`
  })
  .set(413, {
    name: `Request Entity Too Large`,
    desc: `The server will not accept the request`
  })
  .set(414, {
    name: `Request-URI Too Long`,
    desc: `The server will not accept the request`
  })
  .set(415, {
    name: `Unsupported Media Type`,
    desc: `The server will not accept the request`
  })
  .set(416, {
    name: `Requested Range Not Satisfiable`,
    desc: `The client has asked for a portion of the file`
  })
  .set(417, {
    name: `Expectation Failed`,
    desc: `The server cannot meet the requirements of the Expect request-header field`
  })
  .set(500, {
    name: `Internal Server Error`,
    desc: `A generic error message`
  })
  .set(501, {
    name: `Not Implemented`,
    desc: `The server either does not recognize the request method`
  })
  .set(502, {
    name: `Bad Gateway`,
    desc: `The server was acting as a gateway or proxy and received an invalid response from the upstream server`
  })
  .set(503, {
    name: `Service Unavailable`,
    desc: `The server is currently unavailable (overloaded or down)`
  })
  .set(504, {
    name: `Gateway Timeout`,
    desc: `The server was acting as a gateway or proxy and did not receive a timely response from the upstream server`
  })
  .set(505, {
    name: `HTTP Version Not Supported`,
    desc: `The server does not support the HTTP protocol version used in the request`
  })
  .set(511, {
    name: `Network Authentication Required`,
    desc: `The client needs to auth`
  });

module.exports = {
  HttpStatusEnum
}
