/* Line-oriented browser stdin. Asyncify suspends the Wasm caller while the
 * worker continues servicing UI messages and its heartbeat. Other descriptors
 * retain the ordinary Emscripten filesystem read behavior. */
addToLibrary({
  fd_read__deps: ['$FS', '$SYSCALLS', '$doReadv'],
  fd_read__async: 'auto',
  fd_read: async (fd, iov, iovcnt, pnum) => {
    try {
      if (fd !== 0) {
        var stream = SYSCALLS.getStreamFromFD(fd);
        HEAPU32[pnum >>> 2] = doReadv(stream, iov, iovcnt);
        return 0;
      }
      if (iovcnt < 0 || iovcnt > 1024) return {{{ cDefs.EINVAL }}};
      if (iov < 0 || iov + iovcnt * 8 > HEAPU8.length || pnum < 0 || pnum + 4 > HEAPU8.length) return {{{ cDefs.EFAULT }}};
      var capacity = 0;
      for (var i = 0; i < iovcnt; i++) {
        var address = HEAPU32[(iov + i * 8) >>> 2];
        var length = HEAPU32[(iov + i * 8 + 4) >>> 2];
        if (address + length > HEAPU8.length) return {{{ cDefs.EFAULT }}};
        capacity += length;
      }
      if (!capacity) { HEAPU32[pnum >>> 2] = 0; return 0; }
      var bytes = await Module['glstudioReadInput'](Math.min(capacity, 65536));
      var copied = 0;
      for (var i = 0; i < iovcnt && copied < bytes.length; i++) {
        var address = HEAPU32[(iov + i * 8) >>> 2];
        var length = HEAPU32[(iov + i * 8 + 4) >>> 2];
        var count = Math.min(length, bytes.length - copied);
        HEAPU8.set(bytes.subarray(copied, copied + count), address);
        copied += count;
      }
      HEAPU32[pnum >>> 2] = copied;
      return 0;
    } catch (error) {
      if (error instanceof FS.ErrnoError) return error.errno;
      throw error;
    }
  }
});
