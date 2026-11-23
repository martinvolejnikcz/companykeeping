package com.martinvolejnik.companykeeping;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import org.springframework.web.server.ResponseStatusException;

@ControllerAdvice(basePackageClasses = CompanykeepingApplication.class)
class JsonBodyLimit extends RequestBodyAdviceAdapter {
    static final int BYTES = 256 * 1024;

    @Override
    public boolean supports(MethodParameter parameter, Type targetType, Class<? extends HttpMessageConverter<?>> converter) {
        return true;
    }

    // Chunked requests have no Content-Length. Verify actual bytes before parsing JSON.
    @Override
    public HttpInputMessage beforeBodyRead(HttpInputMessage message, MethodParameter parameter, Type targetType,
                                           Class<? extends HttpMessageConverter<?>> converter) throws IOException {
        byte[] bytes = message.getBody().readNBytes(BYTES + 1);
        if (bytes.length > BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The request is too large.");
        return new HttpInputMessage() {
            public HttpHeaders getHeaders() { return message.getHeaders(); }
            public InputStream getBody() { return new ByteArrayInputStream(bytes); }
        };
    }
}
