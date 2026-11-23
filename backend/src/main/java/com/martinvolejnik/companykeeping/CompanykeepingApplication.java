package com.martinvolejnik.companykeeping;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;

@SpringBootApplication
public class CompanykeepingApplication {
    public static void main(String[] args) {
        SpringApplication.run(CompanykeepingApplication.class, args);
    }

    @EventListener
    void started(WebServerInitializedEvent event) {
        var host = event.getApplicationContext().getEnvironment().getProperty("server.address", "127.0.0.1");
        System.out.printf("Companykeeping listening at http://%s:%d%n", host, event.getWebServer().getPort());
    }
}
