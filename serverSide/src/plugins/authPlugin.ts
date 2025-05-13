import fp from 'fastify-plugin'

export default fp(async (fastify)=>{
    fastify.decorate('authenticate', async function (request, reply) {
        if (!request.session.userId) reply.code(401).send({error: 'Unauthorized'});
        
    })
})