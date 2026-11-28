import sys,certifi
certifi.where=lambda: '/root/.ccr/ca-bundle.crt'
import asyncio,edge_tts
async def m(text,voice,out,rate):
    c=edge_tts.Communicate(text,voice,rate=rate)
    await c.save(out)
asyncio.run(m(sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4] if len(sys.argv)>4 else '+0%'))
